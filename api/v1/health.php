<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);

    echo json_encode([
        'error' => 'Method not allowed'
    ]);

    exit;
}

http_response_code(200);

echo json_encode([
    'status' => 'ok',
    'service' => 'kikuubo-payment-api'
]);
