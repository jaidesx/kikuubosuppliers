<?php
declare(strict_types=1);
require_once __DIR__ . '/CollectionProvider.php';
final class MtnCollectionProvider implements CollectionProvider
{
    public function __construct(private PDO $pdo) {}
    public function availability(): array
    {
        return ['enabled' => false, 'reason' => 'MTN UGX collections are awaiting Uganda production onboarding. The EUR sandbox cannot collect this order.'];
    }
    public function initiate(string $paymentReference): array
    {
        // This release intentionally has no environment flag that enables live charging.
        if (!$this->availability()['enabled']) {
            throw new RuntimeException($this->availability()['reason']);
        }
        return (new MtnPaymentOrchestrator($this->pdo, new MtnPaymentReservation($this->pdo),
            new PaymentDispatchService($this->pdo), $this->client()))->initiate($paymentReference);
    }
    private function client(): MtnCollectionsClient
    {
        return new MtnCollectionsClient((string) getenv('MTN_SUBSCRIPTION_KEY'),
            (string) getenv('MTN_API_USER'), (string) getenv('MTN_API_KEY'));
    }
    public function verify(string $paymentReference): array
    {
        return (new MtnPaymentVerifier($this->pdo, $this->client(),
            new MtnPaymentReconciliation($this->pdo)))->verify($paymentReference);
    }
}
