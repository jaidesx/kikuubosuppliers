<?php
declare(strict_types=1);

header('Content-Type: application/json');

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

if ($path === '/collection/token/' && $method === 'POST') {
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if ($authorization !== 'Basic ' . base64_encode('test-user:test-key')) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    echo json_encode([
        'access_token' => 'mock-access-token',
        'token_type' => 'access_token',
        'expires_in' => 3600
    ]);
    exit;
}

if ($path === '/collection/v1_0/requesttopay' && $method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);

    if (
        ($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer mock-access-token' ||
        ($_SERVER['HTTP_X_TARGET_ENVIRONMENT'] ?? '') !== 'sandbox' ||
        ($_SERVER['HTTP_OCP_APIM_SUBSCRIPTION_KEY'] ?? '') !== 'test-subscription' ||
        ($body['amount'] ?? null) !== '100' ||
        ($body['currency'] ?? null) !== 'EUR' ||
        ($body['payer']['partyId'] ?? null) !== '256700000000'
    ) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request']);
        exit;
    }

    http_response_code(202);
    exit;
}

if (
    preg_match(
        '#^/collection/v1_0/requesttopay/[0-9a-f-]+$#i',
        $path
    ) &&
    $method === 'GET'
) {
    if (
        ($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer mock-access-token'
    ) {
        http_response_code(401);
        exit;
    }

    echo json_encode([
        'financialTransactionId' => 'MOCK-12345',
        'status' => 'SUCCESSFUL',
        'amount' => '100',
        'currency' => 'EUR'
    ]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
