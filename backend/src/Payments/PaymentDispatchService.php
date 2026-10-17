<?php
declare(strict_types=1);

final class PaymentDispatchService
{
    public function __construct(private PDO $pdo)
    {
    }

    public function claim(string $paymentReference): array
    {
        $this->pdo->beginTransaction();

        try {
            $parent = $this->pdo->prepare('SELECT order_id FROM payment_transactions WHERE payment_reference = ?');
            $parent->execute([$paymentReference]);
            $parentId = $parent->fetchColumn();
            $parentLock = $this->pdo->prepare('SELECT id FROM orders WHERE id = ? FOR UPDATE');
            $parentLock->execute([$parentId]);
            if (!$parentLock->fetchColumn()) { throw new InvalidArgumentException('Payment order not found'); }

            $orderQuery = $this->pdo->prepare('SELECT id, order_status, confirmed_total_ugx
                FROM orders WHERE id = ? FOR UPDATE');
            $orderQuery->execute([$parentId]);
            $order = $orderQuery->fetch(PDO::FETCH_ASSOC);
            // Access rows precede child payment locks, just as in authorized creation.
            $accessLock = $this->pdo->prepare('SELECT id FROM order_payment_access WHERE order_id = ? FOR UPDATE');
            $accessLock->execute([$parentId]);
            $accessLock->fetchAll();

            $query = $this->pdo->prepare(
                'SELECT id, provider, status, dispatch_state,
                        provider_request_reference,
                        amount_ugx, currency, payment_access_id
                 FROM payment_transactions
                 WHERE payment_reference = ?
                 FOR UPDATE'
            );

            $query->execute([$paymentReference]);
            $payment = $query->fetch(PDO::FETCH_ASSOC);

            if (!$payment) {
                throw new InvalidArgumentException('Payment not found');
            }

            if ($payment['payment_access_id'] !== null) {
                $access = $this->pdo->prepare('SELECT id FROM order_payment_access
                    WHERE id = ? AND order_id = ? AND revoked_at IS NULL
                    AND expires_at > UTC_TIMESTAMP() FOR UPDATE');
                $access->execute([$payment['payment_access_id'], $order['id']]);
                if (!$access->fetchColumn()) { throw new RuntimeException('Payment authorization expired or revoked'); }
            }

            if ($payment['provider'] !== 'mtn') {
                throw new RuntimeException('Not an MTN payment');
            }

            if ($payment['status'] !== 'CREATED') {
                throw new RuntimeException(
                    'Payment is not eligible for dispatch'
                );
            }

            if ($payment['dispatch_state'] !== 'RESERVED') {
                throw new RuntimeException(
                    'Payment has already been claimed for dispatch'
                );
            }

            if (empty($payment['provider_request_reference'])) {
                throw new RuntimeException(
                    'MTN reference must be reserved first'
                );
            }

            if (
                $order['order_status'] !== 'AWAITING_PAYMENT' ||
                (string) $order['confirmed_total_ugx'] !==
                    (string) $payment['amount_ugx']
            ) {
                throw new RuntimeException(
                    'Order status or confirmed amount has changed'
                );
            }

            if ($payment['currency'] !== 'UGX') {
                throw new RuntimeException(
                    'Unexpected payment currency'
                );
            }

            $update = $this->pdo->prepare(
                "UPDATE payment_transactions
                 SET dispatch_state = 'DISPATCHING',
                     dispatch_started_at = CURRENT_TIMESTAMP
                 WHERE id = ?
                   AND status = 'CREATED'
                   AND dispatch_state = 'RESERVED'"
            );

            $update->execute([$payment['id']]);

            if ($update->rowCount() !== 1) {
                throw new RuntimeException(
                    'Payment dispatch claim failed'
                );
            }

            $this->pdo->commit();

            return [
                'payment_reference' => $paymentReference,
                'provider_request_reference' =>
                    $payment['provider_request_reference'],
                'dispatch_state' => 'DISPATCHING'
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }

    public function markAccepted(string $paymentReference): void
    {
        $statement = $this->pdo->prepare(
            "UPDATE payment_transactions
             SET dispatch_state = 'ACCEPTED',
                 status = 'PENDING',
                 dispatch_completed_at = CURRENT_TIMESTAMP
             WHERE payment_reference = ?
               AND dispatch_state = 'DISPATCHING'
               AND status = 'CREATED'"
        );

        $statement->execute([$paymentReference]);

        if ($statement->rowCount() !== 1) {
            throw new RuntimeException(
                'Payment cannot be marked accepted'
            );
        }
    }

    public function markUncertain(string $paymentReference): void
    {
        $statement = $this->pdo->prepare(
            "UPDATE payment_transactions
             SET dispatch_state = 'RECONCILIATION_REQUIRED',
                 status = 'PENDING',
                 dispatch_completed_at = CURRENT_TIMESTAMP
             WHERE payment_reference = ?
               AND dispatch_state = 'DISPATCHING'
               AND status = 'CREATED'"
        );

        $statement->execute([$paymentReference]);

        if ($statement->rowCount() !== 1) {
            throw new RuntimeException(
                'Payment cannot be marked uncertain'
            );
        }
    }
}
