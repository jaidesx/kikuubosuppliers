<?php
declare(strict_types=1);

final class PaymentService
{
    public function __construct(
        private PDO $pdo
    ) {}

    private function accessId(string $token): int
    {
        $q = $this->pdo->prepare('SELECT id FROM order_payment_access WHERE token_hash = ?');
        $q->execute([hash('sha256', $token)]);
        return (int) $q->fetchColumn();
    }

    public function create(
        string $orderReference,
        string $provider,
        string $phoneNumber,
        string $idempotencyKey,
        ?string $accessToken = null
    ): array {
        $provider = strtolower(trim($provider));
        $phoneNumber = trim($phoneNumber);
        $idempotencyKey = strtolower(trim($idempotencyKey));

        if (!in_array($provider, ['mtn', 'airtel'], true)) {
            throw new InvalidArgumentException('Unsupported payment provider');
        }

        if (!preg_match('/^\+2567[0-9]{8}$/', $phoneNumber)) {
            throw new InvalidArgumentException(
                'Phone number must use +2567XXXXXXXX format'
            );
        }

        if (!preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/',
            $idempotencyKey
        )) {
            throw new InvalidArgumentException('Invalid idempotency key');
        }

        $this->pdo->beginTransaction();

        try {
            // Lock the order while checking its payable amount.
            $statement = $this->pdo->prepare(
                'SELECT id, confirmed_total_ugx, order_status
                 FROM orders
                 WHERE order_reference = ?
                 FOR UPDATE'
            );

            $statement->execute([$orderReference]);
            $order = $statement->fetch(PDO::FETCH_ASSOC);

            if (!$order) {
                throw new InvalidArgumentException('Order not found');
            }

            // Lock order -> access -> payment consistently across all mutations.
            if ($accessToken !== null) {
                require_once __DIR__ . '/PaymentAccessService.php';
                (new PaymentAccessService($this->pdo))->authorizeLocked($accessToken, (int) $order['id']);
            }

            // Check whether this request was already processed.
            $existing = $this->pdo->prepare(
                'SELECT p.*, o.order_reference
                 FROM payment_transactions p
                 JOIN orders o ON o.id = p.order_id
                 WHERE p.order_id = ? AND p.idempotency_key = ?
                 FOR UPDATE'
            );

            $existing->execute([$order['id'], $idempotencyKey]);
            $payment = $existing->fetch(PDO::FETCH_ASSOC);

            if ($payment) {
                if (
                    $payment['order_reference'] !== $orderReference ||
                    $payment['provider'] !== $provider ||
                    $payment['phone_number'] !== $phoneNumber
                ) {
                    throw new RuntimeException(
                        'Idempotency key already used for another payment'
                    );
                }

                $this->pdo->commit();

                return [
                    'payment_reference' => $payment['payment_reference'],
                    'status' => $payment['status'],
                    'amount_ugx' => (int) $payment['amount_ugx'],
                    'currency' => $payment['currency'],
                    'provider' => $payment['provider'],
                    'replayed' => true
                ];
            }

            if ($order['order_status'] !== 'AWAITING_PAYMENT') {
                throw new RuntimeException(
                    'Order is not approved for payment'
                );
            }

            $amount = $order['confirmed_total_ugx'];

            if ($amount === null || (int) $amount <= 0) {
                throw new RuntimeException(
                    'Order has no confirmed payable amount'
                );
            }

            // Prevent multiple active attempts for one order.
            $active = $this->pdo->prepare(
                "SELECT id
                 FROM payment_transactions
                 WHERE order_id = ?
                   AND status IN ('CREATED', 'PENDING')
                 LIMIT 1"
            );

            $active->execute([$order['id']]);

            if ($active->fetchColumn()) {
                throw new RuntimeException(
                    'An active payment already exists for this order'
                );
            }

            $paymentReference = 'PAY-' .
                strtoupper(bin2hex(random_bytes(12)));

            $insert = $this->pdo->prepare(
                'INSERT INTO payment_transactions (
                    order_id,
                    payment_reference,
                    provider,
                    phone_number,
                    amount_ugx,
                    currency,
                    status,
                    idempotency_key, payment_access_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );

            $insert->execute([
                $order['id'],
                $paymentReference,
                $provider,
                $phoneNumber,
                $amount,
                'UGX',
                'CREATED',
                $idempotencyKey,
                $accessToken === null ? null : $this->accessId($accessToken)
            ]);

            $this->pdo->commit();

            return [
                'payment_reference' => $paymentReference,
                'status' => 'CREATED',
                'amount_ugx' => (int) $amount,
                'currency' => 'UGX',
                'provider' => $provider,
                'replayed' => false
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }
}
