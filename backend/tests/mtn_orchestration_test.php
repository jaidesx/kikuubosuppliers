<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';
spl_autoload_register(static function ($class) {
    foreach (['Services', 'Payments'] as $dir) {
        $file = __DIR__ . '/../src/' . $dir . '/' . $class . '.php';
        if (is_file($file)) { require_once $file; return; }
    }
});
final class MockMtnTransport implements MtnCollectionsTransport
{
    public array $response = []; public int $calls = 0;
    public function __construct(private string $outcome) {}
    public function supportsCurrency(string $currency): bool { return $currency === 'UGX'; }
    public function requestToPay(string $referenceId, string $externalId, int $amount, string $phoneNumber, string $currency = 'EUR'): array {
        $this->calls++;
        if ($this->outcome === 'network') throw new RuntimeException('Simulated timeout');
        return ['accepted' => $this->outcome === 'accepted', 'http_status' => $this->outcome === 'accepted' ? 202 : 500];
    }
    public function transactionStatus(string $referenceId): array { return ['http_status' => 200, 'body' => $this->response]; }
}
$pdo = databaseConnection();
if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== 'kikuubo_dev') throw new RuntimeException('Development DB required');
$ids = []; $passed = 0;
function assertMtn(bool $condition, string $message): void { global $passed; if (!$condition) throw new LogicException($message); $passed++; echo "PASS: $message\n"; }
try {
    foreach (['accepted', 'network', 'server-error', 'rejected'] as $outcome) {
        $reference = 'TEST-MTN-' . bin2hex(random_bytes(8));
        $pdo->prepare("INSERT INTO orders (order_reference, customer_name, customer_phone, delivery_location, preferred_payment_method, confirmed_total_ugx, order_status)
            VALUES (?, 'Mock', '+256700000000', 'Kampala', 'mtn', 2500, 'AWAITING_PAYMENT')")->execute([$reference]);
        $ids[] = (int) $pdo->lastInsertId();
        $token = (new PaymentAccessService($pdo))->issue($reference)['token'];
        $payment = (new PaymentService($pdo))->create($reference, 'mtn', '+256700000000', bin2hex(random_bytes(4)) . '-1234-4234-8234-' . bin2hex(random_bytes(6)), $token);
        $ref = $payment['payment_reference']; $transport = new MockMtnTransport($outcome);
        $orchestrator = new MtnPaymentOrchestrator($pdo, new MtnPaymentReservation($pdo), new PaymentDispatchService($pdo), $transport);
        try { $orchestrator->initiate($ref); } catch (RuntimeException $e) { if ($outcome !== 'network') throw $e; }
        $state = (new PaymentAccessService($pdo))->status($token);
        assertMtn($state['payment']['status'] === 'PENDING' && $state['order_status'] === 'AWAITING_PAYMENT', "$outcome is never treated as successful collection");
        try { $orchestrator->initiate($ref); } catch (RuntimeException $e) {}
        assertMtn($transport->calls === 1, "$outcome cannot cause duplicate provider requests");
        $transport->response = ['status' => $outcome === 'rejected' ? 'FAILED' : 'SUCCESSFUL', 'amount' => '2500', 'currency' => 'UGX', 'externalId' => $ref, 'financialTransactionId' => 'MOCK-' . bin2hex(random_bytes(8))];
        $verifier = new MtnPaymentVerifier($pdo, $transport, new MtnPaymentReconciliation($pdo));
        $result = $verifier->verify($ref);
        assertMtn($result['verified'] && $result['status'] === ($outcome === 'rejected' ? 'FAILED' : 'SUCCESSFUL'), "$outcome settles only after matching status verification");
    }
    $sandbox = new MtnCollectionsClient('dummy', 'dummy', 'dummy');
    assertMtn(!$sandbox->supportsCurrency('UGX') && $sandbox->supportsCurrency('EUR'), 'Real MTN sandbox cannot interpret UGX as EUR');
    try { new MtnCollectionsClient('dummy', 'dummy', 'dummy', 'production'); throw new LogicException('Production enabled'); }
    catch (RuntimeException $e) { assertMtn(true, 'Real MTN production client remains disabled'); }
    echo "MTN orchestration tests: $passed passed; mock transport only.\n";
} finally {
    foreach ($ids as $id) {
        $pdo->prepare('DELETE FROM payment_transactions WHERE order_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM order_payment_access WHERE order_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([$id]);
    }
}
