<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/Services/PaymentService.php';
require_once __DIR__ . '/../src/Payments/MtnPaymentReservation.php';
require_once __DIR__ . '/../src/Payments/PaymentDispatchService.php';

$pdo = databaseConnection();
$payments = new PaymentService($pdo);
$reservations = new MtnPaymentReservation($pdo);
$dispatch = new PaymentDispatchService($pdo);

$passed = 0;
$orderIds = [];

function checkDispatch(bool $condition, string $description): void
{
    global $passed;

    if (!$condition) {
        throw new RuntimeException("FAIL: {$description}");
    }

    echo "PASS: {$description}\n";
    $passed++;
}

function expectDispatchFailure(callable $operation): bool
{
    try {
        $operation();
        return false;
    } catch (InvalidArgumentException | RuntimeException $exception) {
        return true;
    }
}

function createDispatchPayment(
    PDO $pdo,
    PaymentService $payments,
    MtnPaymentReservation $reservations,
    array &$orderIds
): array {
    $reference = 'TEST-' . strtoupper(bin2hex(random_bytes(8)));

    $statement = $pdo->prepare(
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

    $statement->execute([
        $reference,
        'Dispatch Test',
        '+256700000000',
        'Kampala',
        'mtn',
        10000,
        12500,
        'AWAITING_PAYMENT'
    ]);

    $orderIds[] = (int) $pdo->lastInsertId();

    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);

    $key = sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );

    $payment = $payments->create(
        $reference,
        'mtn',
        '+256700000000',
        $key
    );

    $reservations->reserve($payment['payment_reference']);

    return $payment;
}

try {
    // Test accepted request lifecycle.
    $payment = createDispatchPayment(
        $pdo,
        $payments,
        $reservations,
        $orderIds
    );

    $reference = $payment['payment_reference'];

    $claim = $dispatch->claim($reference);

    checkDispatch(
        $claim['dispatch_state'] === 'DISPATCHING',
        'Payment can be claimed for dispatch'
    );

    checkDispatch(
        expectDispatchFailure(
            fn() => $dispatch->claim($reference)
        ),
        'Second dispatch claim is rejected'
    );

    $dispatch->markAccepted($reference);

    $query = $pdo->prepare(
        'SELECT status, dispatch_state
         FROM payment_transactions
         WHERE payment_reference = ?'
    );

    $query->execute([$reference]);
    $stored = $query->fetch(PDO::FETCH_ASSOC);

    checkDispatch(
        $stored['status'] === 'PENDING',
        'Accepted request remains PENDING'
    );

    checkDispatch(
        $stored['dispatch_state'] === 'ACCEPTED',
        'Accepted request records dispatch state'
    );

    checkDispatch(
        expectDispatchFailure(
            fn() => $dispatch->claim($reference)
        ),
        'Accepted payment cannot be dispatched again'
    );

    // Test uncertain network outcome.
    $uncertainPayment = createDispatchPayment(
        $pdo,
        $payments,
        $reservations,
        $orderIds
    );

    $uncertainReference = $uncertainPayment['payment_reference'];

    $dispatch->claim($uncertainReference);
    $dispatch->markUncertain($uncertainReference);

    $query->execute([$uncertainReference]);
    $uncertain = $query->fetch(PDO::FETCH_ASSOC);

    checkDispatch(
        $uncertain['status'] === 'PENDING',
        'Uncertain payment remains PENDING'
    );

    checkDispatch(
        $uncertain['dispatch_state'] ===
            'RECONCILIATION_REQUIRED',
        'Uncertain payment requires reconciliation'
    );

    checkDispatch(
        expectDispatchFailure(
            fn() => $dispatch->claim($uncertainReference)
        ),
        'Uncertain payment cannot be dispatched again'
    );

    echo "\nPayment dispatch tests: {$passed} passed.\n";
} finally {
    foreach ($orderIds as $orderId) {
        $pdo->prepare(
            'DELETE FROM payment_transactions WHERE order_id = ?'
        )->execute([$orderId]);

        $pdo->prepare(
            'DELETE FROM orders WHERE id = ?'
        )->execute([$orderId]);
    }

    echo "Temporary test records cleaned up.\n";
}
