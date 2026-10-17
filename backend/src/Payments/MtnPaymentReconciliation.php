<?php
declare(strict_types=1);

final class MtnPaymentReconciliation
{
    public function __construct(private PDO $pdo)
    {
    }

    public function reconcile(
        string $paymentReference,
        array $providerResponse,
        bool $trustedStatusResponse = false
    ): array {
        $this->pdo->beginTransaction();

        try {
            $parent = $this->pdo->prepare('SELECT order_id FROM payment_transactions WHERE payment_reference = ?');
            $parent->execute([$paymentReference]);
            $parentId = $parent->fetchColumn();
            $parentLock = $this->pdo->prepare('SELECT id FROM orders WHERE id = ? FOR UPDATE');
            $parentLock->execute([$parentId]);
            if (!$parentLock->fetchColumn()) { throw new InvalidArgumentException('Payment order not found'); }

            $query = $this->pdo->prepare(
                'SELECT id, order_id, provider, status, dispatch_state,
                        provider_request_reference,
                        provider_transaction_id,
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

            if (empty($payment['provider_request_reference'])) {
                throw new RuntimeException(
                    'MTN request reference is missing'
                );
            }

            if (!in_array(
                $payment['dispatch_state'],
                ['DISPATCHING', 'ACCEPTED', 'RECONCILIATION_REQUIRED'],
                true
            )) {
                throw new RuntimeException(
                    'Payment has not been dispatched'
                );
            }

            if ($payment['status'] === 'SUCCESSFUL') {
                $orderCheck = $this->pdo->prepare(
                    'SELECT order_status
                     FROM orders
                     WHERE id = ?
                     FOR UPDATE'
                );
                $orderCheck->execute([$payment['order_id']]);

                if ($orderCheck->fetchColumn() !== 'PAID') {
                    throw new RuntimeException(
                        'Verified payment has inconsistent order status'
                    );
                }

                $this->pdo->commit();

                return [
                    'status' => 'SUCCESSFUL',
                    'already_verified' => true
                ];
            }

            if (in_array(
                $payment['status'],
                ['FAILED', 'CANCELLED'],
                true
            )) {
                throw new RuntimeException(
                    'Terminal payment cannot be reconciled'
                );
            }

            $status = strtoupper(
                trim((string) ($providerResponse['status'] ?? ''))
            );

            if (!in_array(
                $status,
                ['SUCCESSFUL', 'PENDING', 'FAILED'],
                true
            )) {
                throw new RuntimeException(
                    'Unknown MTN transaction status'
                );
            }

            if ($status === 'PENDING') {
                $this->pdo->commit();

                return [
                    'status' => $payment['status'],
                    'provider_status' => 'PENDING',
                    'verified' => false
                ];
            }

            // Do not close an uncertain payment solely because
            // an untrusted or incomplete response says FAILED.
            if ($status === 'FAILED' && !$trustedStatusResponse) {
                $this->pdo->commit();

                return [
                    'status' => $payment['status'],
                    'provider_status' => 'FAILED',
                    'verified' => false,
                    'requires_review' => true
                ];
            }

            $transactionId = trim(
                (string) (
                    $providerResponse['financialTransactionId'] ?? ''
                )
            );

            $amount = (string) (
                $providerResponse['amount'] ?? ''
            );

            $currency = strtoupper(
                trim((string) (
                    $providerResponse['currency'] ?? ''
                ))
            );

            $externalId = (string) (
                $providerResponse['externalId'] ?? ''
            );

            if ($transactionId === '') {
                throw new RuntimeException(
                    'MTN transaction ID is missing'
                );
            }

            if (
                !preg_match('/^[0-9]+$/', $amount) ||
                (string) (int) $amount !==
                    (string) $payment['amount_ugx']
            ) {
                throw new RuntimeException(
                    'MTN payment amount mismatch'
                );
            }

            if ($currency !== $payment['currency']) {
                throw new RuntimeException(
                    'MTN payment currency mismatch'
                );
            }

            if ($externalId !== $paymentReference) {
                throw new RuntimeException(
                    'MTN external reference mismatch'
                );
            }

            if ($status === 'FAILED') {
                // Only the authenticated status verifier may close a failed attempt.
                // Incomplete failed responses stay pending for manual reconciliation.
                $failed = $this->pdo->prepare("UPDATE payment_transactions
                    SET status = 'FAILED', provider_status = 'FAILED', provider_transaction_id = ?,
                        verified_at = CURRENT_TIMESTAMP, dispatch_completed_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND status IN ('CREATED', 'PENDING')");
                $failed->execute([$transactionId, $payment['id']]);
                $this->pdo->commit();
                return ['status' => 'FAILED', 'verified' => true];
            }

            $update = $this->pdo->prepare(
                "UPDATE payment_transactions
                 SET status = 'SUCCESSFUL',
                     provider_status = 'SUCCESSFUL',
                     provider_transaction_id = ?,
                     verified_at = CURRENT_TIMESTAMP,
                     dispatch_completed_at = CURRENT_TIMESTAMP
                 WHERE id = ?
                   AND status IN ('CREATED', 'PENDING')"
            );

            $update->execute([
                $transactionId,
                $payment['id']
            ]);

            if ($update->rowCount() !== 1) {
                throw new RuntimeException(
                    'Payment verification update failed'
                );
            }

            $order = $this->pdo->prepare(
                "UPDATE orders
                 SET order_status = 'PAID'
                 WHERE id = ?
                   AND order_status = 'AWAITING_PAYMENT'
                   AND confirmed_total_ugx = ?"
            );

            $order->execute([
                $payment['order_id'],
                $payment['amount_ugx']
            ]);

            if ($order->rowCount() !== 1) {
                throw new RuntimeException(
                    'Order settlement failed; payment rolled back'
                );
            }

            $this->pdo->commit();

            return [
                'status' => 'SUCCESSFUL',
                'verified' => true,
                'provider_transaction_id' => $transactionId
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }
}
