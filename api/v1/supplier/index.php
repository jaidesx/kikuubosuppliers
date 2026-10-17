<?php
declare(strict_types=1);
require_once __DIR__ . '/../payment_bootstrap.php';
try {
    $pdo = databaseConnection();
    SupplierAuth::startSession();
    $auth = new SupplierAuth($pdo);
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        paymentReply(200, ['csrf' => $_SESSION['csrf'], 'authenticated' => $auth->authenticated()]);
    }
    $input = paymentInput();
    if (!SupplierAuth::csrf(paymentString($input, 'csrf'))) { paymentReply(403, ['error' => 'Reload this page and try again']); }
    $action = paymentString($input, 'action');
    if ($action === 'login') {
        if (!$auth->login(paymentString($input, 'username'), paymentString($input, 'password'), $_SERVER['REMOTE_ADDR'] ?? '')) {
            paymentReply(401, ['error' => 'Login unavailable. Check credentials or try again later.']);
        }
        paymentReply(200, ['csrf' => $_SESSION['csrf'], 'authenticated' => true]);
    }
    if (!$auth->authenticated()) { paymentReply(401, ['error' => 'Please sign in']); }
    if ($action === 'logout') { $_SESSION = []; session_destroy(); paymentReply(200, ['ok' => true]); }
    $supplier = new SupplierService($pdo);
    if ($action === 'orders') { paymentReply(200, ['orders' => $supplier->orders()]); }
    $reference = paymentString($input, 'order_reference');
    if ($action === 'items') { paymentReply(200, ['items' => $supplier->items($reference)]); }
    if ($action === 'approve') {
        if (!isset($input['amount_ugx']) || !is_int($input['amount_ugx'])) { throw new InvalidArgumentException('Invalid amount'); }
        $supplier->approve($reference, $input['amount_ugx']);
        paymentReply(200, ['ok' => true]);
    }
    $access = new PaymentAccessService($pdo);
    if ($action === 'issue') { paymentReply(200, $access->issue($reference)); }
    if ($action === 'revoke') { $access->revokeOrder($reference); paymentReply(200, ['ok' => true]); }
    paymentReply(400, ['error' => 'Unknown action']);
} catch (InvalidArgumentException $e) {
    paymentReply(400, ['error' => 'Check the order reference and whole UGX amount']);
} catch (RuntimeException $e) {
    paymentReply(409, ['error' => 'Operation unavailable. Check order status and payment activity.']);
} catch (Throwable $e) {
    paymentReply(503, ['error' => 'Supplier service temporarily unavailable']);
}
