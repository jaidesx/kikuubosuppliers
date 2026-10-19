<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/Services/PaymentService.php';
require_once __DIR__ . '/../src/Payments/MtnPaymentReservation.php';

$pdo = databaseConnection();
$payments = new PaymentService($pdo);
$reservations = new MtnPaymentReservation($pdo);

$passed = 0;
$orderId = null;

function verifyReservation(bool $condition, string $message): void
{
    global $passed;

    if (!$condition) {
        throw new RuntimeException("FAIL: {$message}");
    }

    echo "PASS: {$message}\n";
    $passed++;
}

function rejectsReservation(callable $operation): bool
{
    try {
        $operation();
        return false;
    } catch (InvalidArgumentException | RuntimeException $exception) {
        return true;
    }
}

try {
    $orderReference = 'TEST-' . strtoupper(bin2hex(random_bytes(8)));

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
        $orderReference,
        'MTN Reservation Test',
        '+256700000000',
        'Kampala',
        'mtn',
        10000,
        12500,
        'AWAITING_PAYMENT'
    ]);

    $orderId = (int) $pdo->lastInsertId();

    $key = sprintf(
        '123e4567-e89b-42d3-a456-%012x',
        random_int(0, 0xffffffffffff)
    );

    $payment = $payments->create(
        $orderReference,
        'mtn',
        '+256700000000',
        $key
    );

    $first = $reservations->reserve(
        $payment['payment_reference']
    );

    verifyReservation(
        preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
            $first['provider_request_reference']
        ) === 1,
        'Generates a valid MTN UUID v4'
    );

    $second = $reservations->reserve(
        $payment['payment_reference']
    );

    verifyReservation(
        $first['provider_request_reference'] ===
        $second['provider_request_reference'],
        'Repeated reservation preserves the same UUID'
    );

    verifyReservation(
        $first['amount_ugx'] === 12500,
        'Reservation retains confirmed order amount'
    );

    verifyReservation(
        $first['currency'] === 'UGX',
        'Reservation retains UGX currency'
    );

    $query = $pdo->prepare(
        'SELECT provider_request_reference
         FROM payment_transactions
         WHERE payment_reference = ?'
    );

    $query->execute([$payment['payment_reference']]);

    verifyReservation(
        $query->fetchColumn() ===
        $first['provider_request_reference'],
        'MTN UUID is persisted in MySQL'
    );

    verifyReservation(
        rejectsReservation(
            fn() => $reservations->reserve('PAY-DOES-NOT-EXIST')
        ),
        'Rejects nonexistent payment'
    );

    $pdo->prepare(
        "UPDATE payment_transactions
         SET status = 'FAILED'
         WHERE payment_reference = ?"
    )->execute([$payment['payment_reference']]);

    verifyReservation(
        rejectsReservation(
            fn() => $reservations->reserve(
                $payment['payment_reference']
            )
        ),
        'Rejects failed payment'
    );

    echo "\nMTN reservation tests: {$passed} passed.\n";
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
