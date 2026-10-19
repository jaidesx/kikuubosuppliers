<?php
declare(strict_types=1);
require_once __DIR__ . '/../payment_bootstrap.php';
try {
    $pdo = databaseConnection();
    $https = ($_SERVER['HTTPS'] ?? '') === 'on';
    $local = getenv('KIKUUBO_APP_ENV') === 'development'
        && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    if (!$https && !$local) { paymentReply(403, ['error' => 'HTTPS required']); }
    $input = paymentInput();
    $limit = (new RateLimiter($pdo, 120, 60))->consume($_SERVER['REMOTE_ADDR'] ?? '');
    if (!$limit['allowed']) { header('Retry-After: ' . $limit['retry_after']); paymentReply(429, ['error' => 'Please wait before trying again']); }
    $token = paymentString($input, 'token');
    $action = paymentString($input, 'action');
    $service = new CustomerPaymentService($pdo, [
        'mtn' => new MtnCollectionProvider($pdo), 'airtel' => new AirtelCollectionProvider(),
    ]);
    if ($action === 'status') {
        paymentReply(200, ['order' => $service->status($token), 'providers' => $service->availability()]);
    }
    if ($action === 'initiate') {
        (new PaymentAccessService($pdo))->validate($token);
        $provider = paymentString($input, 'provider');
        $availability = $service->availability();
        if (!isset($availability[$provider])) { throw new InvalidArgumentException('Unsupported provider'); }
        if (!$availability[$provider]['enabled']) {
            paymentReply(503, ['error' => $availability[$provider]['reason'], 'collections_disabled' => true]);
        }
        paymentReply(200, ['order' => $service->initiate($token, $provider,
            paymentString($input, 'phone'), paymentString($input, 'idempotency_key'))]);
    }
    paymentReply(400, ['error' => 'Unknown action']);
} catch (InvalidArgumentException $e) {
    paymentReply(400, ['error' => 'Invalid payment request']);
} catch (RuntimeException $e) {
    paymentReply(403, ['error' => 'Payment link unavailable or request could not be completed']);
} catch (Throwable $e) {
    paymentReply(503, ['error' => 'Payment service temporarily unavailable']);
}
