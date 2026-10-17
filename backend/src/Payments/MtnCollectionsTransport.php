<?php
declare(strict_types=1);
/** Implemented by the sandbox client; production transport requires a separate reviewed implementation. */
interface MtnCollectionsTransport
{
    public function supportsCurrency(string $currency): bool;
    public function requestToPay(string $referenceId, string $externalId, int $amount,
        string $phoneNumber, string $currency = 'EUR'): array;
    public function transactionStatus(string $referenceId): array;
}
