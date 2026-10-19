<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Payments/MtnCollectionsClient.php';

$client = new MtnCollectionsClient(
    'test-subscription',
    'test-user',
    'test-key',
    'sandbox',
    'https://127.0.0.1:18443'
);

$passed = 0;

function verify(bool $condition, string $message): void
{
    global $passed;

    if (!$condition) {
        throw new RuntimeException('FAIL: ' . $message);
    }

    echo "PASS: {$message}\n";
    $passed++;
}

$reference = '123e4567-e89b-42d3-a456-123456789abc';

verify(
    $client->accessToken() === 'mock-access-token',
    'OAuth token authentication'
);

$result = $client->requestToPay(
    $reference,
    'KKS-TEST-ORDER',
    100,
    '+256700000000',
    'EUR'
);

verify(
    $result['accepted'] === true,
    'MTN accepts RequestToPay'
);

verify(
    $result['payment_status'] === 'NOT_VERIFIED',
    'Accepted request is not considered paid'
);

$status = $client->transactionStatus($reference);

verify(
    $status['http_status'] === 200,
    'Transaction status endpoint responds'
);

verify(
    ($status['body']['status'] ?? null) === 'SUCCESSFUL',
    'Provider reports successful payment'
);

verify(
    ($status['body']['financialTransactionId'] ?? null) === 'MOCK-12345',
    'Provider transaction reference received'
);

try {
    $client->requestToPay(
        $reference,
        'KKS-TEST-ORDER',
        -100,
        '+256700000000'
    );

    throw new RuntimeException('Invalid amount was accepted');
} catch (InvalidArgumentException $exception) {
    verify(true, 'Rejects negative payment amount');
}

echo "\nMTN mock integration tests: {$passed} passed.\n";
