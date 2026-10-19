<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/Services/PaymentAccessService.php';

$pdo = databaseConnection();

if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== 'kikuubo_dev') {
    exit("Refusing to run outside kikuubo_dev\n");
}

$service = new PaymentAccessService($pdo);
$passed = 0;
$orderId = null;

function check(bool $condition, string $description): void
{
    global $passed;

    if (!$condition) {
        throw new RuntimeException("FAIL: {$description}");
    }

    $passed++;
    echo "PASS: {$description}\n";
}

function rejects(callable $callback): bool
{
    try {
        $callback();
        return false;
    } catch (InvalidArgumentException | RuntimeException $exception) {
        return true;
    }
}

try {
    // Reuse the existing order schema through OrderService.
    require_once __DIR__ . '/../src/Services/OrderService.php';

    // Inspect the existing schema to avoid assumptions about
    // required order columns.
    $columns = $pdo->query('SHOW COLUMNS FROM orders')
        ->fetchAll(PDO::FETCH_ASSOC);

    $fields = array_column($columns, 'Field');

    if (!in_array('order_reference', $fields, true)) {
        throw new RuntimeException('Missing order_reference column');
    }

    // Create an isolated development-only test order.
    $reference = 'TEST-ACCESS-' . strtoupper(bin2hex(random_bytes(8)));

    $insert = $pdo->prepare(
        "INSERT INTO orders (
            order_reference, customer_name, customer_phone,
            delivery_location, preferred_payment_method,
            estimated_subtotal_ugx, confirmed_total_ugx,
            order_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    $insert->execute([
        $reference,
        'Payment Access Test',
        '+256700000000',
        'Kampala',
        'mtn',
        10000,
        12500,
        'AWAITING_PAYMENT'
    ]);

    $orderId = (int) $pdo->lastInsertId();

    $first = $service->issue($reference, 60);

    check(
        preg_match('/^[a-f0-9]{64}$/', $first['token']) === 1,
        'Generates a 256-bit random token'
    );

    $validated = $service->validate($first['token']);

    check(
        $validated['order_reference'] === $reference,
        'Token resolves to correct order'
    );

    check(
        $validated['currency'] === 'UGX' &&
        $validated['amount_ugx'] > 0,
        'Token returns confirmed UGX amount'
    );

    $second = $service->issue($reference, 60);

    check(
        $first['token'] !== $second['token'],
        'Replacement token is unique'
    );

    check(
        rejects(fn () => $service->validate($first['token'])),
        'Previous token is invalidated'
    );

    check(
        $service->revoke($second['token']),
        'Active token can be revoked'
    );

    check(
        rejects(fn () => $service->validate($second['token'])),
        'Revoked token is rejected'
    );

    $third = $service->issue($reference, 60);

    $expire = $pdo->prepare(
        'UPDATE order_payment_access
         SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)
         WHERE token_hash = ?'
    );

    $expire->execute([hash('sha256', $third['token'])]);

    check(
        rejects(fn () => $service->validate($third['token'])),
        'Expired token is rejected'
    );

    check(
        rejects(fn () => $service->issue('NONEXISTENT-ORDER')),
        'Unknown order cannot receive a token'
    );

    echo "\nPayment access tests: {$passed} passed.\n";
} finally {
    if ($orderId !== null) {
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'DELETE FROM order_payment_access WHERE order_id = ?'
            )->execute([$orderId]);

            $pdo->prepare(
                'DELETE FROM orders WHERE id = ?'
            )->execute([$orderId]);

            $pdo->commit();
            echo "Temporary test order and tokens cleaned up.\\n";
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
