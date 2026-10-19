<?php
declare(strict_types=1);

final class PaymentAccessService
{
    public function __construct(private PDO $pdo)
    {
    }

    /**
     * Internal supplier-authorized operation only.
     * Never expose directly through an unauthenticated API.
     */
    public function issue(string $orderReference, int $ttlMinutes = 60): array
    {
        if ($ttlMinutes < 1 || $ttlMinutes > 1440) {
            throw new InvalidArgumentException('Invalid token lifetime');
        }

        $this->pdo->beginTransaction();

        try {
            $query = $this->pdo->prepare(
                'SELECT id, order_status, confirmed_total_ugx
                 FROM orders
                 WHERE order_reference = ?
                 FOR UPDATE'
            );

            $query->execute([$orderReference]);
            $order = $query->fetch(PDO::FETCH_ASSOC);

            if (!$order) {
                throw new InvalidArgumentException('Order not found');
            }

            if (
                $order['order_status'] !== 'AWAITING_PAYMENT' ||
                $order['confirmed_total_ugx'] === null ||
                (int) $order['confirmed_total_ugx'] <= 0
            ) {
                throw new RuntimeException(
                    'Order is not approved for payment'
                );
            }

            // Revoke previous links for this order.
            $revoke = $this->pdo->prepare(
                'UPDATE order_payment_access
                 SET revoked_at = UTC_TIMESTAMP()
                 WHERE order_id = ?
                   AND revoked_at IS NULL'
            );

            $revoke->execute([$order['id']]);

            $token = bin2hex(random_bytes(32));
            $hash = hash('sha256', $token);

            $insert = $this->pdo->prepare(
                'INSERT INTO order_payment_access
                 (order_id, token_hash, expires_at)
                 VALUES (
                    ?,
                    ?,
                    DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
                 )'
            );

            $insert->execute([
                $order['id'],
                $hash,
                $ttlMinutes
            ]);

            $this->pdo->commit();

            return [
                'token' => $token,
                'expires_in_minutes' => $ttlMinutes,
                'order_reference' => $orderReference
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }

    /** Caller must already hold the parent order lock in this transaction. */
    public function authorizeLocked(string $token, int $orderId): void
    {
        if (!$this->pdo->inTransaction() || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new RuntimeException('Payment link is invalid or expired');
        }
        $query = $this->pdo->prepare('SELECT id FROM order_payment_access
            WHERE order_id = ? AND token_hash = ? AND revoked_at IS NULL
            AND expires_at > UTC_TIMESTAMP() FOR UPDATE');
        $query->execute([$orderId, hash('sha256', $token)]);
        if (!$query->fetchColumn()) {
            throw new RuntimeException('Payment link is invalid or expired');
        }
    }

    /** Authorized status reads also work after settlement. No customer PII. */
    public function status(string $token): array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new RuntimeException('Payment link is invalid or expired');
        }
        $query = $this->pdo->prepare('SELECT o.id, o.order_reference, o.order_status,
            o.confirmed_total_ugx AS amount_ugx, a.expires_at
            FROM order_payment_access a JOIN orders o ON o.id = a.order_id
            WHERE a.token_hash = ? AND a.revoked_at IS NULL AND a.expires_at > UTC_TIMESTAMP()');
        $query->execute([hash('sha256', $token)]);
        $order = $query->fetch();
        if (!$order) {
            throw new RuntimeException('Payment link is invalid or expired');
        }
        $payment = $this->pdo->prepare('SELECT payment_reference, provider, status, dispatch_state,
            verified_at FROM payment_transactions WHERE order_id = ? ORDER BY id DESC LIMIT 1');
        $payment->execute([$order['id']]);
        $order['payment'] = $payment->fetch() ?: null;
        unset($order['id']);
        $order['currency'] = 'UGX';
        return $order;
    }

    public function revokeOrder(string $reference): void
    {
        $this->pdo->beginTransaction();
        try {
            $q = $this->pdo->prepare('SELECT id FROM orders WHERE order_reference = ? FOR UPDATE');
            $q->execute([$reference]);
            $id = $q->fetchColumn();
            if (!$id) { throw new InvalidArgumentException('Order not found'); }
            $this->pdo->prepare('UPDATE order_payment_access SET revoked_at = UTC_TIMESTAMP()
                WHERE order_id = ? AND revoked_at IS NULL')->execute([$id]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) { $this->pdo->rollBack(); }
            throw $e;
        }
    }

    /**
     * Validate a customer token without exposing the stored hash.
     */
    public function validate(string $token): array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new InvalidArgumentException(
                'Invalid payment access token'
            );
        }

        $hash = hash('sha256', $token);

        $query = $this->pdo->prepare(
            'SELECT o.order_reference,
                    o.order_status,
                    o.confirmed_total_ugx,
                    a.expires_at
             FROM order_payment_access a
             JOIN orders o ON o.id = a.order_id
             WHERE a.token_hash = ?
               AND a.revoked_at IS NULL
               AND a.expires_at > UTC_TIMESTAMP()
             LIMIT 1'
        );

        $query->execute([$hash]);
        $order = $query->fetch(PDO::FETCH_ASSOC);

        if (!$order) {
            throw new RuntimeException(
                'Payment link is invalid or expired'
            );
        }

        if (
            $order['order_status'] !== 'AWAITING_PAYMENT' ||
            $order['confirmed_total_ugx'] === null ||
            (int) $order['confirmed_total_ugx'] <= 0
        ) {
            throw new RuntimeException(
                'Order is not available for payment'
            );
        }

        return [
            'order_reference' => $order['order_reference'],
            'amount_ugx' => (int) $order['confirmed_total_ugx'],
            'currency' => 'UGX',
            'expires_at' => $order['expires_at']
        ];
    }

    /**
     * Internal supplier-authorized operation only.
     */
    public function revoke(string $token): bool
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new InvalidArgumentException(
                'Invalid payment access token'
            );
        }

        $query = $this->pdo->prepare(
            'UPDATE order_payment_access
             SET revoked_at = UTC_TIMESTAMP()
             WHERE token_hash = ?
               AND revoked_at IS NULL'
        );

        $query->execute([hash('sha256', $token)]);

        return $query->rowCount() === 1;
    }
}
