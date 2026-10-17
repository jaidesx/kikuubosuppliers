<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/Payments/MtnCollectionsClient.php';
require_once __DIR__ . '/../src/Payments/MtnPaymentReconciliation.php';
require_once __DIR__ . '/../src/Payments/MtnPaymentVerifier.php';

$pdo = databaseConnection();

$client = new MtnCollectionsClient(
    'test-subscription',
    'test-user',
    'test-key',
    'sandbox',
    'https://127.0.0.1:18443'
);

$reconciliation = new MtnPaymentReconciliation($pdo);
$verifier = new MtnPaymentVerifier(
    $pdo,
    $client,
    $reconciliation
);

$passed = 0;

function expectFailure(callable $callback, string $description): void
{
    global $passed;

    try {
        $callback();
        throw new LogicException(
            'Expected failure did not occur'
        );
    } catch (InvalidArgumentException | RuntimeException $exception) {
        echo "PASS: {$description}\n";
        $passed++;
    }
}

expectFailure(
    fn() => $verifier->verify(
        'PAY-NONEXISTENT-' . strtoupper(bin2hex(random_bytes(8)))
    ),
    'Nonexistent payment rejected before provider request'
);

echo "\nMTN verifier guard tests: {$passed} passed.\n";
