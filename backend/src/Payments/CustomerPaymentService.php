<?php
declare(strict_types=1);
final class CustomerPaymentService
{
    /** Providers are constructed server-side only; never selected from request configuration. */
    public function __construct(private PDO $pdo, private array $providers) {}
    public function availability(): array
    {
        return array_map(static fn (CollectionProvider $p): array => $p->availability(), $this->providers);
    }
    public function initiate(string $token, string $provider, string $phone, string $key): array
    {
        $access = new PaymentAccessService($this->pdo);
        $order = $access->validate($token);
        $adapter = $this->providers[$provider] ?? null;
        if (!$adapter || !$adapter->availability()['enabled']) {
            throw new RuntimeException($adapter ? $adapter->availability()['reason'] : 'Unsupported provider');
        }
        $payment = (new PaymentService($this->pdo))->create($order['order_reference'], $provider, $phone, $key, $token);
        if (!$payment['replayed']) {
            $adapter->initiate($payment['payment_reference']);
        }
        // All status is read from persisted backend state, never a client/provider POST response.
        return $access->status($token);
    }
    public function status(string $token): array
    {
        return (new PaymentAccessService($this->pdo))->status($token);
    }
}
