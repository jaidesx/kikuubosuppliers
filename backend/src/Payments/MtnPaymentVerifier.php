<?php
declare(strict_types=1);

final class MtnPaymentVerifier
{
    public function __construct(
        private PDO $pdo,
        private MtnCollectionsTransport $client,
        private MtnPaymentReconciliation $reconciliation
    ) {
    }

    public function verify(string $paymentReference): array
    {
        $query = $this->pdo->prepare(
            'SELECT provider, provider_request_reference,
                    status, dispatch_state, currency
             FROM payment_transactions
             WHERE payment_reference = ?'
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

        if (!$this->client->supportsCurrency($payment['currency'])) {
            throw new RuntimeException('Provider environment does not support payment currency');
        }

        $response = $this->client->transactionStatus(
            $payment['provider_request_reference']
        );

        if ($response['http_status'] !== 200) {
            throw new RuntimeException(
                'MTN status verification failed (HTTP ' .
                $response['http_status'] . ')'
            );
        }

        if (
            !is_array($response['body']) ||
            !isset($response['body']['status'])
        ) {
            throw new RuntimeException(
                'MTN returned an invalid status response'
            );
        }

        return $this->reconciliation->reconcile(
            $paymentReference,
            $response['body'],
            true
        );
    }
}
