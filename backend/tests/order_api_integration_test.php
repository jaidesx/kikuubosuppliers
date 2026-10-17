<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

$baseUrl = getenv('KIKUUBO_TEST_API_URL')
    ?: 'http://127.0.0.1:8081/api/v1/orders/';

$pdo = databaseConnection();
$passed = 0;

function check(bool $condition, string $description): void
{
    global $passed;

    if (!$condition) {
        throw new RuntimeException("FAILED: $description");
    }

    $passed++;
    echo "PASS: $description\n";
}

function apiRequest(
    string $url,
    array $body,
    string $key
): array {
    $handle = curl_init($url);

    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Idempotency-Key: ' . $key,
        ],
        CURLOPT_POSTFIELDS => json_encode(
            $body,
            JSON_THROW_ON_ERROR
        ),
        CURLOPT_TIMEOUT => 15,
    ]);

    $response = curl_exec($handle);

    if ($response === false) {
        throw new RuntimeException(
            'HTTP request failed: ' . curl_error($handle)
        );
    }

    $status = curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);

    return [
        'status' => $status,
        'body' => json_decode(
            $response,
            true,
            512,
            JSON_THROW_ON_ERROR
        ),
    ];
}

function uuidV4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);

    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}

$key = uuidV4();

$order = [
    'customer' => [
        'name' => 'Integration Test',
        'phone' => '0756000000',
        'location' => 'Kampala',
        'notes' => 'Automated test',
    ],
    'payment_method' => 'mtn',
    'items' => [
        ['product_id' => 1, 'quantity' => 2],
        ['product_id' => 25, 'quantity' => 1],
    ],
];

echo "\n=== Kikuubo Order API Integration Tests ===\n\n";

$first = apiRequest($baseUrl, $order, $key);

check($first['status'] === 201, 'New order returns HTTP 201');
check(
    ($first['body']['estimated_subtotal_ugx'] ?? null) === 19000,
    'Subtotal calculated from server catalogue'
);
check(
    ($first['body']['requires_quotation'] ?? null) === true,
    'Quotation-only product recognized'
);
check(
    ($first['body']['payment_status'] ?? null) === 'NOT_INITIATED',
    'Payment is not initiated'
);

$reference = $first['body']['order_reference'] ?? null;

check(
    is_string($reference) &&
    preg_match('/^KKS-[A-F0-9]{16}$/', $reference) === 1,
    'Order reference generated'
);

$second = apiRequest($baseUrl, $order, $key);

check($second['status'] === 200, 'Replay returns HTTP 200');
check(
    ($second['body']['order_reference'] ?? null) === $reference,
    'Replay preserves order reference'
);
check(
    ($second['body']['requires_quotation'] ?? null) === true,
    'Replay preserves quotation status'
);

$changed = $order;
$changed['items'][0]['quantity'] = 3;

$conflict = apiRequest($baseUrl, $changed, $key);

check($conflict['status'] === 409, 'Changed request returns HTTP 409');

$invalid = $order;
$invalid['items'][0]['product_id'] = 999999;

$invalidResponse = apiRequest($baseUrl, $invalid, uuidV4());

check(
    $invalidResponse['status'] === 400,
    'Unknown product rejected'
);

$invalidQuantity = $order;
$invalidQuantity['items'][0]['quantity'] = 0;

$quantityResponse = apiRequest(
    $baseUrl,
    $invalidQuantity,
    uuidV4()
);

check(
    $quantityResponse['status'] === 400,
    'Invalid quantity rejected'
);

$statement = $pdo->prepare(
    'SELECT id FROM orders WHERE order_reference = ?'
);
$statement->execute([$reference]);
$orderId = $statement->fetchColumn();

check($orderId !== false, 'Order exists in MySQL');

$statement = $pdo->prepare(
    'SELECT COUNT(*) FROM order_items WHERE order_id = ?'
);
$statement->execute([$orderId]);

check(
    (int) $statement->fetchColumn() === 2,
    'Both order items persisted'
);

$statement = $pdo->prepare(
    'SELECT COUNT(*) FROM orders WHERE idempotency_key = ?'
);
$statement->execute([$key]);

check(
    (int) $statement->fetchColumn() === 1,
    'Only one order exists for idempotency key'
);

echo "\nAll $passed integration checks passed.\n";
