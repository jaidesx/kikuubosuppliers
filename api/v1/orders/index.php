<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_THROW_ON_ERROR);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Method not allowed']);
}

$contentType = strtolower(trim(explode(
    ';',
    $_SERVER['CONTENT_TYPE'] ?? ''
)[0]));

if ($contentType !== 'application/json') {
    respond(415, ['error' => 'Content-Type must be application/json']);
}

$key = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '';

if (!is_string($key) ||
    !preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $key
    )) {
    respond(400, ['error' => 'A valid UUID Idempotency-Key is required']);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) {
    respond(413, ['error' => 'Request body too large']);
}

$body = file_get_contents('php://input', false, null, 0, 65537);

if ($body === false || strlen($body) > 65536) {
    respond(413, ['error' => 'Request body too large']);
}

try {
    $request = json_decode($body, true, 512, JSON_THROW_ON_ERROR);

    if (!is_array($request) || array_is_list($request)) {
        respond(400, ['error' => 'Expected a JSON object']);
    }

    require_once __DIR__ . '/../bootstrap.php';

    $backendPath = kikuuboBackendPath();

    require_once $backendPath . '/config/database.php';
    require_once $backendPath . '/src/Services/OrderRequestValidator.php';
    require_once $backendPath . '/src/Services/OrderService.php';
    require_once $backendPath . '/src/Services/RateLimiter.php';

    $pdo = databaseConnection();

    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
    $rateLimiter = new RateLimiter($pdo);
    $rateLimit = $rateLimiter->consume($clientIp);

    if (!$rateLimit['allowed']) {
        header('Retry-After: ' . $rateLimit['retry_after']);
        respond(429, [
            'error' => 'Too many requests. Please try again later.'
        ]);
    }

    $catalogue = new ProductCatalogue(
        $backendPath . '/data/catalogue.json'
    );

    $validator = new OrderRequestValidator(
        new OrderItemValidator($catalogue)
    );

    $order = $validator->validate($request);

    $service = new OrderService($pdo);
    $result = $service->create($order, strtolower($key));

    respond($result['replayed'] ? 200 : 201, $result);
} catch (IdempotencyConflictException $exception) {
    respond(409, ['error' => $exception->getMessage()]);
} catch (JsonException | InvalidArgumentException $exception) {
    respond(400, ['error' => $exception->getMessage()]);
} catch (Throwable $exception) {
    error_log('Kikuubo order API failure: ' . $exception->getMessage());
    respond(500, ['error' => 'Unable to process order']);
}
