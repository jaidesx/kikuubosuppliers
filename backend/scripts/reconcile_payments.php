<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/database.php';
spl_autoload_register(static function (string $class): void {
    foreach (['Services', 'Payments'] as $dir) {
        $file = __DIR__ . '/../src/' . $dir . '/' . $class . '.php';
        if (is_file($file)) { require_once $file; return; }
    }
});
$pdo = databaseConnection();
$providers = ['mtn' => new MtnCollectionProvider($pdo), 'airtel' => new AirtelCollectionProvider()];
$rows = $pdo->query("SELECT payment_reference, provider FROM payment_transactions
    WHERE status IN ('CREATED', 'PENDING')
    AND dispatch_state IN ('DISPATCHING', 'ACCEPTED', 'RECONCILIATION_REQUIRED')
    ORDER BY updated_at ASC LIMIT 100")->fetchAll();
$failed = false;
foreach ($rows as $row) {
    try {
        $result = $providers[$row['provider']]->verify($row['payment_reference']);
        echo $row['payment_reference'] . ': ' . $result['status'] . PHP_EOL;
    } catch (Throwable $e) {
        // Do not log secrets, provider payloads, customer phone numbers, or access tokens.
        fwrite(STDERR, $row['payment_reference'] . ": verification unavailable; retry status lookup only\n");
        $failed = true;
    }
}
exit($failed ? 1 : 0);
