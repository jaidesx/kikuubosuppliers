<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/Services/PaymentService.php';

$pdo = databaseConnection();
$service = new PaymentService($pdo);

$passed = 0;
$failed = 0;
$orderId = null;

function checkPaymentTest(bool $condition, string $description): void
{
    global $passed, $failed;

    if ($condition) {
        echo "PASS: {$description}\n";
        $passed++;
    } else {
        echo "FAIL: {$description}\n";
        $failed++;
    }
}

function expectPaymentException(callable $callback): bool
{
    try {
        $callback();
        return false;
    } catch (InvalidArgumentException | RuntimeException $exception) {
        return true;
    }
}

try {
    $reference = 'TEST-' . strtoupper(bin2hex(random_bytes(8)));

    $insert = $pdo->prepare(
        "INSERT INTO orders (
            order_reference,
            customer_name,
            customer_phone,
            delivery_location,
            preferred_payment_method,
            estimated_subtotal_ugx,
            confirmed_total_ugx,
            order_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    $insert->execute([
        $reference,
        'Payment Integration Test',
        '+256700000000',
        'Kampala',
        'mtn',
        10000,
        12500,
        'AWAITING_PAYMENT'
    ]);

    $orderId = (int) $pdo->lastInsertId();

    $key1 = '123e4567-e89b-42d3-a456-' . bin2hex(random_bytes(6));
    $key2 = '123e4567-e89b-42d3-a456-' . bin2hex(random_bytes(6));

    $payment = $service->create(
        $reference,
        'mtn',
        '+256700000000',
        $key1
    );

    checkPaymentTest(
        $payment['status'] === 'CREATED',
        'Creates payment with CREATED status'
    );

    checkPaymentTest(
        $payment['amount_ugx'] === 12500,
        'Uses confirmed total instead of estimated subtotal'
    );

    checkPaymentTest(
        $payment['provider'] === 'mtn',
        'Stores selected provider'
    );

    checkPaymentTest(
        str_starts_with($payment['payment_reference'], 'PAY-'),
        'Generates payment reference'
    );

    $replay = $service->create(
        $reference,
        'mtn',
        '+256700000000',
        $key1
    );

    checkPaymentTest(
        $replay['replayed'] === true,
        'Recognizes idempotent replay'
    );

    checkPaymentTest(
        $replay['payment_reference'] === $payment['payment_reference'],
        'Replay preserves original payment reference'
    );

    checkPaymentTest(
        expectPaymentException(fn() => $service->create(
            $reference,
            'airtel',
            '+256700000000',
            $key1
        )),
        'Rejects reuse of key with different provider'
    );

    checkPaymentTest(
        expectPaymentException(fn() => $service->create(
            $reference,
            'mtn',
            '+256700000000',
            $key2
        )),
        'Rejects another active payment for the same order'
    );

    checkPaymentTest(
        expectPaymentException(fn() => $service->create(
            $reference,
            'invalid',
            '+256700000000',
            $key2
        )),
        'Rejects unsupported payment provider'
    );

    checkPaymentTest(
        expectPaymentException(fn() => $service->create(
            $reference,
            'mtn',
            '0700000000',
            $key2
        )),
        'Rejects invalid phone format'
    );

    $pdo->prepare(
        "UPDATE orders SET order_status = 'PENDING_REVIEW' WHERE id = ?"
    )->execute([$orderId]);

    $pdo->prepare(
        "UPDATE payment_transactions
         SET status = 'FAILED'
         WHERE order_id = ?"
    )->execute([$orderId]);

    checkPaymentTest(
        expectPaymentException(fn() => $service->create(
            $reference,
            'mtn',
            '+256700000000',
            $key2
        )),
        'Rejects payment when order is not approved'
    );

    $pdo->prepare(
        "UPDATE orders
         SET order_status = 'AWAITING_PAYMENT',
             confirmed_total_ugx = NULL
         WHERE id = ?"
    )->execute([$orderId]);

    checkPaymentTest(
        expectPaymentException(fn() => $service->create(
            $reference,
            'mtn',
            '+256700000000',
            $key2
        )),
        'Rejects payment without confirmed amount'
    );

    $count = $pdo->prepare(
        'SELECT COUNT(*) FROM payment_transactions WHERE order_id = ?'
    );
    $count->execute([$orderId]);

    checkPaymentTest(
        (int) $count->fetchColumn() === 1,
        'No duplicate payment transactions created'
    );
} finally {
    if ($orderId !== null) {
        $pdo->prepare(
            'DELETE FROM payment_transactions WHERE order_id = ?'
        )->execute([$orderId]);

        $pdo->prepare(
            'DELETE FROM orders WHERE id = ?'
        )->execute([$orderId]);

        echo "\nTemporary payment test records cleaned up.\n";
    }
}

echo "\nPayment tests: {$passed} passed, {$failed} failed.\n";

exit($failed === 0 ? 0 : 1);
