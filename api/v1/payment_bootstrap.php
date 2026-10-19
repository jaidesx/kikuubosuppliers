<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
function paymentReply(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_THROW_ON_ERROR);
    exit;
}
function paymentInput(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { paymentReply(405, ['error' => 'POST required']); }
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        paymentReply(415, ['error' => 'JSON required']);
    }
    $raw = file_get_contents('php://input', false, null, 0, 8193);
    if ($raw === false || strlen($raw) > 8192) { paymentReply(413, ['error' => 'Request too large']); }
    try { $body = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { paymentReply(400, ['error' => 'Invalid JSON']); }
    if (!is_array($body)) { paymentReply(400, ['error' => 'Invalid request']); }
    return $body;
}
function paymentString(array $input, string $key): string
{
    if (!isset($input[$key]) || !is_string($input[$key]) || strlen($input[$key]) > 256) {
        throw new InvalidArgumentException('Invalid request');
    }
    return $input[$key];
}
$backend = kikuuboBackendPath();
require_once $backend . '/config/database.php';
spl_autoload_register(static function (string $class) use ($backend): void {
    if (!preg_match('/^[A-Za-z]+$/', $class)) { return; }
    foreach (['Services', 'Payments'] as $dir) {
        $file = $backend . '/src/' . $dir . '/' . $class . '.php';
        if (is_file($file)) { require_once $file; return; }
    }
});
