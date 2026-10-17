<?php
declare(strict_types=1);

final class MtnPaymentReservation
{
    public function __construct(private PDO $pdo)
    {
    }

    public function reserve(string $paymentReference): array
    {
        $this->pdo->beginTransaction();

        try {
            $query = $this->pdo->prepare(
                'SELECT id, provider, status,
                        provider_request_reference,
                        amount_ugx, currency
                 FROM payment_transactions
                 WHERE payment_reference = ?
                 FOR UPDATE'
            );

            $query->execute([$paymentReference]);
            $payment = $query->fetch(PDO::FETCH_ASSOC);

            if (!$payment) {
                throw new InvalidArgumentException(
                    'Payment transaction not found'
                );
            }

            if ($payment['provider'] !== 'mtn') {
                throw new RuntimeException(
                    'Payment is not assigned to MTN'
                );
            }

            if (!in_array(
                $payment['status'],
                ['CREATED', 'PENDING'],
                true
            )) {
                throw new RuntimeException(
                    'Payment is not eligible for collection'
                );
            }

            $reference = $payment['provider_request_reference'];

            if ($reference === null) {
                $bytes = random_bytes(16);
                $bytes[6] = chr(
                    (ord($bytes[6]) & 0x0f) | 0x40
                );
                $bytes[8] = chr(
                    (ord($bytes[8]) & 0x3f) | 0x80
                );

                $hex = bin2hex($bytes);

                $reference = sprintf(
                    '%s-%s-%s-%s-%s',
                    substr($hex, 0, 8),
                    substr($hex, 8, 4),
                    substr($hex, 12, 4),
                    substr($hex, 16, 4),
                    substr($hex, 20, 12)
                );

                $update = $this->pdo->prepare(
                    'UPDATE payment_transactions
                     SET provider_request_reference = ?
                     WHERE id = ?'
                );

                $update->execute([
                    $reference,
                    $payment['id']
                ]);
            }

            $this->pdo->commit();

            return [
                'payment_reference' => $paymentReference,
                'provider_request_reference' => $reference,
                'status' => $payment['status'],
                'amount_ugx' => (int) $payment['amount_ugx'],
                'currency' => $payment['currency'],
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }
}
