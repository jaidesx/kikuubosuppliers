<?php
declare(strict_types=1);
require_once __DIR__ . '/CollectionProvider.php';
final class AirtelCollectionProvider implements CollectionProvider
{
    public function availability(): array
    {
        return ['enabled' => false, 'reason' => 'Airtel collections are awaiting Uganda merchant approval and the approved API specification.'];
    }
    public function initiate(string $paymentReference): array { throw new RuntimeException($this->availability()['reason']); }
    public function verify(string $paymentReference): array { throw new RuntimeException($this->availability()['reason']); }
}
