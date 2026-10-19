<?php
declare(strict_types=1);

final class MtnPaymentOrchestrator
{
    public function __construct(
        private PDO $pdo,
        private MtnPaymentReservation $reservation,
        private PaymentDispatchService $dispatch,
        private MtnCollectionsTransport $client
    ) {
    }

    public function initiate(string $paymentReference): array
    {
        $query = $this->pdo->prepare(
            'SELECT p.provider, p.status, p.dispatch_state,
                    p.phone_number, p.amount_ugx, p.currency,
                    o.order_status, o.confirmed_total_ugx
             FROM payment_transactions p
             JOIN orders o ON o.id = p.order_id
             WHERE p.payment_reference = ?'
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
                'Payment provider is not MTN'
            );
        }

        if (
            $payment['status'] !== 'CREATED' ||
            $payment['dispatch_state'] !== 'RESERVED'
        ) {
            throw new RuntimeException(
                'Payment is already dispatched or not eligible'
            );
        }

        if (
            $payment['order_status'] !== 'AWAITING_PAYMENT' ||
            (string) $payment['confirmed_total_ugx'] !==
                (string) $payment['amount_ugx']
        ) {
            throw new RuntimeException(
                'Order is not eligible for this payment'
            );
        }

        // The current MTN client is sandbox-only and accepts EUR.
        // Our payment records are denominated in UGX.
        // Never send the UGX amount as though it were EUR.
        if (!$this->client->supportsCurrency($payment['currency'])) {
            throw new RuntimeException(
                'MTN dispatch disabled: currency configuration ' .
                'does not match the payment currency'
            );
        }

        // Reserve before dispatch. The UUID is persisted so an
        // uncertain request can be reconciled without resending.
        $reserved = $this->reservation->reserve(
            $paymentReference
        );

        $claimed = $this->dispatch->claim(
            $paymentReference
        );

        try {
            $result = $this->client->requestToPay(
                $claimed['provider_request_reference'],
                $paymentReference,
                (int) $payment['amount_ugx'],
                $payment['phone_number'],
                $payment['currency']
            );

            if ($result['accepted'] === true) {
                $this->dispatch->markAccepted(
                    $paymentReference
                );

                return [
                    'payment_reference' => $paymentReference,
                    'provider_request_reference' =>
                        $claimed['provider_request_reference'],
                    'status' => 'PENDING',
                    'verified' => false
                ];
            }

            $this->dispatch->markUncertain(
                $paymentReference
            );

            return [
                'payment_reference' => $paymentReference,
                'status' => 'RECONCILIATION_REQUIRED',
                'verified' => false
            ];
        } catch (Throwable $exception) {
            // Do not resend automatically. The provider may have
            // received the request before the connection failed.
            try {
                $this->dispatch->markUncertain(
                    $paymentReference
                );
            } catch (Throwable $stateException) {
                // DISPATCHING remains persisted for investigation.
                error_log(
                    'MTN dispatch state update failed; reconciliation required'
                );
            }

            throw new RuntimeException(
                'MTN dispatch outcome uncertain; reconcile before retry',
                0,
                $exception
            );
        }
    }
}
