<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';
spl_autoload_register(static function ($class) {
    foreach (['Services', 'Payments'] as $dir) {
        $file = __DIR__ . '/../src/' . $dir . '/' . $class . '.php';
        if (is_file($file)) { require_once $file; return; }
    }
});
$pdo = databaseConnection();
if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== 'kikuubo_dev') { throw new RuntimeException('Development database required'); }
$ids = []; $passed = 0;
function ok(bool $v, string $message): void { global $passed; if (!$v) throw new LogicException($message); $passed++; echo "PASS: $message\n"; }
function reject(callable $fn): bool { try { $fn(); return false; } catch (RuntimeException | InvalidArgumentException $e) { return true; } }
function fixture(): string {
    global $pdo, $ids;
    $ref = 'TEST-WORKFLOW-' . bin2hex(random_bytes(6));
    $pdo->prepare("INSERT INTO orders (order_reference, customer_name, customer_phone, delivery_location,
        preferred_payment_method, estimated_subtotal_ugx) VALUES (?, 'Workflow test', '+256700000000', 'Kampala', 'mtn', 5000)")->execute([$ref]);
    $ids[] = (int) $pdo->lastInsertId(); return $ref;
}
function keyForTest(): string { return bin2hex(random_bytes(4)) . '-1234-4234-8234-' . bin2hex(random_bytes(6)); }
// Fake exists only in tests; real provider factory cannot select it.
final class WorkflowMockProvider implements CollectionProvider {
    public function __construct(private PDO $pdo, private string $outcome) {}
    public function availability(): array { return ['enabled' => true]; }
    public function initiate(string $reference): array {
        (new MtnPaymentReservation($this->pdo))->reserve($reference);
        $dispatch = new PaymentDispatchService($this->pdo);
        $dispatch->claim($reference);
        if ($this->outcome === 'network') {
            $dispatch->markUncertain($reference);
            throw new RuntimeException('Simulated ambiguous network failure');
        }
        $dispatch->markAccepted($reference);
        return ['status' => 'PENDING'];
    }
    public function verify(string $reference): array { throw new LogicException('No fake success returned by adapter'); }
}
try {
    $supplier = new SupplierService($pdo); $access = new PaymentAccessService($pdo); $payments = new PaymentService($pdo);
    $ref = fixture();
    ok(reject(fn () => $access->issue($ref)), 'Unapproved order cannot receive a link');
    ok(reject(fn () => $supplier->approve($ref, 0)), 'Zero approval amount rejected');
    $supplier->approve($ref, 12000);
    $token = $access->issue($ref)['token'];
    ok($access->validate($token)['amount_ugx'] === 12000, 'Supplier-confirmed amount is authoritative');
    $other = fixture(); $supplier->approve($other, 4000);
    ok(reject(fn () => $payments->create($other, 'mtn', '+256700000000', keyForTest(), $token)), 'Token cannot authorize a different order');
    $key = keyForTest();
    $payment = $payments->create($ref, 'mtn', '+256700000000', $key, $token);
    ok($payment['amount_ugx'] === 12000, 'Authorized creation uses confirmed UGX');
    ok($payments->create($ref, 'mtn', '+256700000000', $key, $token)['replayed'], 'Authorized retry returns original attempt');
    ok(reject(fn () => $payments->create($ref, 'mtn', '+256700000000', keyForTest(), $token)), 'Duplicate active attempt rejected');
    ok(reject(fn () => $supplier->approve($ref, 9000)), 'Active payment prevents amount changes');
    $access->revokeOrder($ref);
    ok(reject(fn () => $payments->create($ref, 'mtn', '+256700000000', $key, $token)), 'Revocation blocks even idempotent replay');
    (new MtnPaymentReservation($pdo))->reserve($payment['payment_reference']);
    ok(reject(fn () => (new PaymentDispatchService($pdo))->claim($payment['payment_reference'])), 'Revocation between creation and dispatch blocks provider request');
    $newToken = $access->issue($other)['token'];
    $supplier->approve($other, 4500);
    ok(reject(fn () => $access->validate($newToken)), 'Amount revision revokes previous quote link');
    $newToken = $access->issue($other)['token'];
    $pdo->prepare('UPDATE order_payment_access SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE token_hash = ?')->execute([hash('sha256', $newToken)]);
    ok(reject(fn () => $payments->create($other, 'mtn', '+256700000000', keyForTest(), $newToken)), 'Expiration checked inside creation transaction');
    $ref2 = fixture(); $supplier->approve($ref2, 7000); $t2 = $access->issue($ref2)['token'];
    $service = new CustomerPaymentService($pdo, ['mtn' => new WorkflowMockProvider($pdo, 'network')]);
    ok(reject(fn () => $service->initiate($t2, 'mtn', '+256700000000', keyForTest())), 'Ambiguous provider error propagated safely');
    $state = $access->status($t2);
    ok($state['payment']['dispatch_state'] === 'RECONCILIATION_REQUIRED', 'Uncertain request remains reserved for reconciliation');
    ok(reject(fn () => $service->initiate($t2, 'mtn', '+256700000000', keyForTest())), 'Ambiguous request cannot be blindly retried');
    $reference = $state['payment']['payment_reference'];
    $reconcile = new MtnPaymentReconciliation($pdo);
    $response = ['status' => 'SUCCESSFUL', 'financialTransactionId' => 'TEST-' . bin2hex(random_bytes(8)), 'amount' => '7000', 'currency' => 'UGX', 'externalId' => $reference];
    foreach (['amount' => '1', 'currency' => 'EUR', 'externalId' => 'wrong', 'financialTransactionId' => ''] as $field => $value) {
        ok(reject(fn () => $reconcile->reconcile($reference, array_replace($response, [$field => $value]))), "Settlement rejects mismatched $field");
    }
    $reconcile->reconcile($reference, $response);
    $settled = $access->status($t2);
    ok($settled['order_status'] === 'PAID' && $settled['payment']['verified_at'] !== null, 'Isolated mock settlement is visible through authorized status');
    ok(reject(fn () => $access->status(str_repeat('a', 64))), 'Invalid link cannot read payment status');
    $disabled = new CustomerPaymentService($pdo, ['airtel' => new AirtelCollectionProvider(), 'mtn' => new MtnCollectionProvider($pdo)]);
    $ref3 = fixture(); $supplier->approve($ref3, 1000); $t3 = $access->issue($ref3)['token'];
    foreach (['airtel', 'mtn'] as $provider) {
        ok(reject(fn () => $disabled->initiate($t3, $provider, '+256700000000', keyForTest())), "$provider disabled before transaction creation");
    }
    ok($access->status($t3)['payment'] === null, 'Disabled providers leave no active payment behind');
    // Concurrent processes use independent connections, and never share a live PDO socket.
    $pdo = null; unset($supplier, $access, $payments, $service, $disabled, $reconcile);
    $dir = sys_get_temp_dir() . '/kikuubo-race-' . bin2hex(random_bytes(6)); mkdir($dir, 0700);
    $children = [];
    for ($i = 0; $i < 4; $i++) {
        $pid = pcntl_fork();
        if ($pid === 0) {
            try { $db = databaseConnection(); (new PaymentService($db))->create($ref3, 'mtn', '+256700000000', keyForTest(), $t3); $result = 'created'; }
            catch (RuntimeException $e) { $result = 'blocked'; }
            file_put_contents("$dir/$i", $result); exit;
        }
        $children[] = $pid;
    }
    foreach ($children as $pid) { pcntl_waitpid($pid, $status); }
    $results = []; foreach (glob("$dir/*") as $f) { $results[] = file_get_contents($f); unlink($f); } rmdir($dir);
    $pdo = databaseConnection();
    ok(count(array_filter($results, fn ($r) => $r === 'created')) === 1 && count($results) === 4, 'Four concurrent initiations create exactly one payment');
    echo "Workflow tests: $passed passed (all provider responses simulated).\n";
} finally {
    $pdo = databaseConnection();
    foreach ($ids as $id) {
        $pdo->prepare('DELETE FROM payment_transactions WHERE order_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM order_payment_access WHERE order_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([$id]);
    }
}
