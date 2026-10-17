<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';
$pdo = databaseConnection();
if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== 'kikuubo_dev') { throw new RuntimeException('Development database required'); }
$base = getenv('KIKUUBO_WORKFLOW_TEST_URL') ?: 'http://127.0.0.1:18081';
if (!str_starts_with($base, 'http://127.0.0.1:')) { throw new RuntimeException('Loopback test URL required'); }
$cookie = tempnam(sys_get_temp_dir(), 'kikuubo-cookie-');
$user = 'test_' . bin2hex(random_bytes(8)); $password = bin2hex(random_bytes(20));
$reference = 'TEST-HTTP-' . bin2hex(random_bytes(8)); $orderId = null; $passed = 0;
function checkHttp(bool $value, string $label): void { global $passed; if (!$value) throw new LogicException($label); $passed++; echo "PASS: $label\n"; }
function httpCall(string $path, ?array $body = null): array {
    global $base, $cookie;
    $ch = curl_init($base . $path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEFILE => $cookie,
        CURLOPT_COOKIEJAR => $cookie, CURLOPT_TIMEOUT => 10]);
    if ($body !== null) curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body)]);
    $raw = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($raw === false) throw new RuntimeException('HTTP server unavailable');
    return [$status, json_decode($raw, true)];
}
$ipBucket = hash('sha256', 'ip:127.0.0.1');
$window = intdiv(time(), 900) * 900;
$q = $pdo->prepare('SELECT attempts FROM supplier_login_limits WHERE bucket = ? AND window_start = ?'); $q->execute([$ipBucket, $window]); $oldIp = $q->fetchColumn();
try {
    $pdo->prepare('INSERT INTO supplier_users (username, password_hash) VALUES (?, ?)')->execute([$user, password_hash($password, PASSWORD_DEFAULT)]);
    $pdo->prepare("INSERT INTO orders (order_reference, customer_name, customer_phone, delivery_location, preferred_payment_method)
        VALUES (?, 'HTTP Test', '+256700000000', 'Kampala', 'mtn')")->execute([$reference]);
    $orderId = (int) $pdo->lastInsertId();
    [$code, $data] = httpCall('/api/v1/supplier/'); $csrf = $data['csrf'];
    checkHttp($code === 200 && !$data['authenticated'], 'Anonymous session issues CSRF token without supplier access');
    [$code] = httpCall('/api/v1/supplier/', ['action' => 'orders', 'csrf' => $csrf]);
    checkHttp($code === 401, 'Anonymous order review rejected');
    [$code] = httpCall('/api/v1/supplier/', ['action' => 'login', 'csrf' => 'wrong', 'username' => $user, 'password' => $password]);
    checkHttp($code === 403, 'Login requires CSRF token');
    [$code] = httpCall('/api/v1/supplier/', ['action' => 'login', 'csrf' => $csrf, 'username' => $user, 'password' => 'wrong']);
    checkHttp($code === 401, 'Incorrect supplier password rejected');
    [$code, $data] = httpCall('/api/v1/supplier/', ['action' => 'login', 'csrf' => $csrf, 'username' => $user, 'password' => $password]);
    checkHttp($code === 200 && $csrf !== $data['csrf'], 'Password login succeeds and rotates CSRF token'); $csrf = $data['csrf'];
    $call = fn (string $action, array $extra = []) => httpCall('/api/v1/supplier/', ['action' => $action, 'csrf' => $csrf, 'order_reference' => $reference] + $extra);
    [$code] = $call('approve', ['amount_ugx' => 15000]); checkHttp($code === 200, 'Authenticated supplier approves final amount');
    [$code, $data] = $call('issue'); $token = $data['token']; checkHttp($code === 200 && strlen($token) === 64, 'Authenticated supplier issues individual link');
    [$code, $data] = httpCall('/api/v1/payments/', ['action' => 'status', 'token' => $token]);
    checkHttp($code === 200 && (int) $data['order']['amount_ugx'] === 15000 && !isset($data['order']['customer_phone']), 'Customer sees server-confirmed amount without customer PII');
    [$code] = httpCall('/api/v1/payments/', ['action' => 'approve', 'token' => $token, 'amount_ugx' => 1]); checkHttp($code === 400, 'Customer cannot approve an order');
    [$code] = httpCall('/api/v1/payments/', ['action' => 'initiate', 'token' => $token, 'provider' => 'mtn', 'amount_ugx' => 1]); checkHttp($code === 503, 'Disabled MTN refuses collection');
    [$code] = $call('revoke'); checkHttp($code === 200, 'Supplier revokes customer link');
    [$code] = httpCall('/api/v1/payments/', ['action' => 'status', 'token' => $token]); checkHttp($code === 403, 'Revoked link cannot read status');
    [$code] = $call('logout'); checkHttp($code === 200, 'Supplier signs out');
    [$code] = $call('orders'); checkHttp($code === 403 || $code === 401, 'Old session cannot review orders after logout');
    [, $data] = httpCall('/api/v1/supplier/'); $csrf = $data['csrf'];
    for ($i = 0; $i < 10; $i++) httpCall('/api/v1/supplier/', ['action' => 'login', 'csrf' => $csrf, 'username' => $user, 'password' => 'incorrect']);
    [$code] = httpCall('/api/v1/supplier/', ['action' => 'login', 'csrf' => $csrf, 'username' => $user, 'password' => $password]); checkHttp($code === 401, 'Account login rate limit blocks further attempts');
    echo "Supplier HTTP tests: $passed passed.\n";
} finally {
    $pdo->prepare('DELETE FROM supplier_users WHERE username = ?')->execute([$user]);
    $pdo->prepare('DELETE FROM supplier_login_limits WHERE bucket = ?')->execute([hash('sha256', 'account:' . $user)]);
    if ($oldIp === false) $pdo->prepare('DELETE FROM supplier_login_limits WHERE bucket = ? AND window_start = ?')->execute([$ipBucket, $window]);
    if ($orderId !== null) {
        $pdo->prepare('DELETE FROM payment_transactions WHERE order_id = ?')->execute([$orderId]);
        $pdo->prepare('DELETE FROM order_payment_access WHERE order_id = ?')->execute([$orderId]);
        $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([$orderId]);
    }
    unlink($cookie);
}
