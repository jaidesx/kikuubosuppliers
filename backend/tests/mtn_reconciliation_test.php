<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/Services/PaymentService.php';
require_once __DIR__ . '/../src/Payments/MtnPaymentReservation.php';
require_once __DIR__ . '/../src/Payments/PaymentDispatchService.php';
require_once __DIR__ . '/../src/Payments/MtnPaymentReconciliation.php';

$pdo = databaseConnection();
$payments = new PaymentService($pdo);
$reservations = new MtnPaymentReservation($pdo);
$dispatch = new PaymentDispatchService($pdo);
$reconciliation = new MtnPaymentReconciliation($pdo);

$passed = 0;
$orderId = null;

function checkResult(bool $condition, string $description): void
{
    global $passed;
    if (!$condition) {
        throw new RuntimeException("FAIL: {$description}");
    }
    echo "PASS: {$description}\n";
    $passed++;
}

function rejectsResponse(callable $operation): bool
{
    try {
        $operation();
        return false;
    } catch (RuntimeException | InvalidArgumentException $e) {
        return true;
    }
}

try {
    $orderReference = 'TEST-' . strtoupper(bin2hex(random_bytes(8)));

    $insert = $pdo->prepare(
        "INSERT INTO orders (
            order_reference, customer_name, customer_phone,
            delivery_location, preferred_payment_method,
            estimated_subtotal_ugx, confirmed_total_ugx,
            order_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    $insert->execute([
        $orderReference, 'Reconciliation Test',
        '+256700000000', 'Kampala', 'mtn',
        10000, 12500, 'AWAITING_PAYMENT'
    ]);

    $orderId = (int) $pdo->lastInsertId();

    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    $key = sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8), substr($hex, 8, 4),
        substr($hex, 12, 4), substr($hex, 16, 4),
        substr($hex, 20, 12)
    );

    $payment = $payments->create(
        $orderReference, 'mtn', '+256700000000', $key
    );

    $reference = $payment['payment_reference'];
    $reservations->reserve($reference);
    $dispatch->claim($reference);
    $dispatch->markAccepted($reference);

    $valid = [
        'status' => 'SUCCESSFUL',
        'financialTransactionId' => 'MOCK-' . bin2hex(random_bytes(8)),
        'amount' => '12500',
        'currency' => 'UGX',
        'externalId' => $reference
    ];

    checkResult(
        rejectsResponse(fn() => $reconciliation->reconcile(
            $reference, array_merge($valid, ['amount' => '100'])
        )),
        'Rejects incorrect payment amount'
    );

    checkResult(
        rejectsResponse(fn() => $reconciliation->reconcile(
            $reference, array_merge($valid, ['currency' => 'EUR'])
        )),
        'Rejects incorrect payment currency'
    );

    checkResult(
        rejectsResponse(fn() => $reconciliation->reconcile(
            $reference, array_merge($valid, ['externalId' => 'OTHER'])
        )),
        'Rejects incorrect external reference'
    );

    checkResult(
        rejectsResponse(fn() => $reconciliation->reconcile(
            $reference, array_merge($valid, ['financialTransactionId' => ''])
        )),
        'Rejects missing provider transaction ID'
    );

    $pending = $reconciliation->reconcile(
        $reference, ['status' => 'PENDING']
    );

    checkResult(
        $pending['verified'] === false,
        'Pending response is not verified'
    );

    $failed = $reconciliation->reconcile(
        $reference, ['status' => 'FAILED']
    );

    checkResult(
        $failed['verified'] === false &&
        ($failed['requires_review'] ?? false) === true,
        'Unverified failure requires review'
    );

    $query = $pdo->prepare(
        'SELECT status FROM payment_transactions
         WHERE payment_reference = ?'
    );
    $query->execute([$reference]);

    checkResult(
        $query->fetchColumn() === 'PENDING',
        'Rejected responses do not change payment to successful'
    );

    $orderQuery = $pdo->prepare(
        'SELECT order_status FROM orders WHERE id = ?'
    );

    $orderQuery->execute([$orderId]);

    checkResult(
        $orderQuery->fetchColumn() === 'AWAITING_PAYMENT',
        'Rejected responses leave order awaiting payment'
    );

    // Verify that failed order settlement rolls back the payment update.
    $pdo->prepare(
        "UPDATE orders SET order_status = 'CANCELLED' WHERE id = ?"
    )->execute([$orderId]);

    $settlementRejected = false;

    try {
        $reconciliation->reconcile($reference, $valid);
    } catch (RuntimeException $exception) {
        $settlementRejected = true;
    }

    checkResult(
        $settlementRejected,
        'Cancelled order cannot be settled'
    );

    $rollbackQuery = $pdo->prepare(
        'SELECT status, verified_at
         FROM payment_transactions
         WHERE payment_reference = ?'
    );
    $rollbackQuery->execute([$reference]);
    $rollbackPayment = $rollbackQuery->fetch(PDO::FETCH_ASSOC);

    checkResult(
        $rollbackPayment['status'] !== 'SUCCESSFUL'
            && $rollbackPayment['verified_at'] === null,
        'Failed order settlement rolls back payment update'
    );

    $orderQuery->execute([$orderId]);

    checkResult(
        $orderQuery->fetchColumn() === 'CANCELLED',
        'Rollback preserves cancelled order'
    );

    // Restore this temporary test order for the success-path checks.
    $pdo->prepare(
        "UPDATE orders
         SET order_status = 'AWAITING_PAYMENT'
         WHERE id = ?"
    )->execute([$orderId]);

    $successful = $reconciliation->reconcile($reference, $valid);

    checkResult(
        $successful['verified'] === true &&
        $successful['status'] === 'SUCCESSFUL',
        'Matching mock response marks payment successful'
    );

    $orderQuery->execute([$orderId]);

    checkResult(
        $orderQuery->fetchColumn() === 'PAID',
        'Verified payment marks order PAID'
    );

    $paymentQuery = $pdo->prepare(
        'SELECT status, verified_at
         FROM payment_transactions
         WHERE payment_reference = ?'
    );

    $paymentQuery->execute([$reference]);
    $storedPayment = $paymentQuery->fetch(PDO::FETCH_ASSOC);

    checkResult(
        $storedPayment['status'] === 'SUCCESSFUL',
        'Payment status becomes SUCCESSFUL'
    );

    checkResult(
        $storedPayment['verified_at'] !== null,
        'Successful payment records verification timestamp'
    );

    $replay = $reconciliation->reconcile($reference, $valid);

    checkResult(
        ($replay['already_verified'] ?? false) === true,
        'Repeated verification is idempotent'
    );

    $orderQuery->execute([$orderId]);

    checkResult(
        $orderQuery->fetchColumn() === 'PAID',
        'Repeated verification preserves PAID order'
    );

    echo "\nMTN reconciliation tests: {$passed} passed.\n";
} finally {
    if ($orderId !== null) {
        $pdo->prepare(
            'DELETE FROM payment_transactions WHERE order_id = ?'
        )->execute([$orderId]);
        $pdo->prepare(
            'DELETE FROM orders WHERE id = ?'
        )->execute([$orderId]);
        echo "Temporary test records cleaned up.\n";
    }
}
