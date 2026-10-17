<?php
declare(strict_types=1);
interface CollectionProvider
{
    public function availability(): array;
    public function initiate(string $paymentReference): array;
    public function verify(string $paymentReference): array;
}
