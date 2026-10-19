<?php
declare(strict_types=1);

require_once __DIR__ . '/MtnCollectionsTransport.php';

final class MtnCollectionsClient implements MtnCollectionsTransport
{
    private string $baseUrl;

    public function __construct(
        private string $subscriptionKey,
        private string $apiUser,
        private string $apiKey,
        private string $environment = 'sandbox',
        ?string $baseUrl = null,
        private ?string $caCertificate = null
    ) {
        if ($environment !== 'sandbox') {
            throw new RuntimeException(
                'Only MTN sandbox is enabled at this stage'
            );
        }

        if ($subscriptionKey === '' || $apiUser === '' || $apiKey === '') {
            throw new InvalidArgumentException(
                'MTN sandbox credentials are required'
            );
        }

        $this->baseUrl = rtrim(
            $baseUrl ?? 'https://sandbox.momodeveloper.mtn.com',
            '/'
        );

        if (!str_starts_with($this->baseUrl, 'https://')) {
            throw new InvalidArgumentException(
                'MTN API URL must use HTTPS'
            );
        }
    }

    public function supportsCurrency(string $currency): bool
    {
        return $currency === 'EUR';
    }

    private function request(
        string $method,
        string $path,
        array $headers,
        ?array $body = null
    ): array {
        $ch = curl_init($this->baseUrl . $path);

        if ($ch === false) {
            throw new RuntimeException('Unable to initialize HTTP client');
        }

        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];

        if ($this->caCertificate !== null) {
            $options[CURLOPT_CAINFO] = $this->caCertificate;
        }

        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode(
                $body,
                JSON_THROW_ON_ERROR
            );
        }

        curl_setopt_array($ch, $options);

        try {
            $response = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

            if ($response === false) {
                throw new RuntimeException(
                    'MTN request failed: ' . curl_error($ch)
                );
            }
        } finally {
            curl_close($ch);
        }

        $decoded = $response !== ''
            ? json_decode($response, true)
            : null;

        return [
            'http_status' => (int) $status,
            'body' => is_array($decoded) ? $decoded : [],
        ];
    }

    public function accessToken(): string
    {
        $response = $this->request(
            'POST',
            '/collection/token/',
            [
                'Authorization: Basic ' . base64_encode(
                    $this->apiUser . ':' . $this->apiKey
                ),
                'Ocp-Apim-Subscription-Key: ' . $this->subscriptionKey,
                'Content-Type: application/json',
            ]
        );

        if (
            $response['http_status'] !== 200 ||
            empty($response['body']['access_token'])
        ) {
            throw new RuntimeException(
                'MTN authentication failed (HTTP ' .
                $response['http_status'] . ')'
            );
        }

        return $response['body']['access_token'];
    }

    public function requestToPay(
        string $referenceId,
        string $externalId,
        int $amount,
        string $phoneNumber,
        string $currency = 'EUR'
    ): array {
        if (!preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
            $referenceId
        )) {
            throw new InvalidArgumentException(
                'MTN reference must be a UUID v4'
            );
        }

        if ($amount <= 0) {
            throw new InvalidArgumentException('Invalid payment amount');
        }

        if (!preg_match('/^\+2567[0-9]{8}$/', $phoneNumber)) {
            throw new InvalidArgumentException('Invalid phone number');
        }

        if ($currency !== 'EUR') {
            throw new InvalidArgumentException(
                'Sandbox requests must use EUR'
            );
        }

        $token = $this->accessToken();

        $response = $this->request(
            'POST',
            '/collection/v1_0/requesttopay',
            [
                'Authorization: Bearer ' . $token,
                'Ocp-Apim-Subscription-Key: ' . $this->subscriptionKey,
                'X-Target-Environment: ' . $this->environment,
                'X-Reference-Id: ' . $referenceId,
                'Content-Type: application/json',
            ],
            [
                'amount' => (string) $amount,
                'currency' => $currency,
                'externalId' => $externalId,
                'payer' => [
                    'partyIdType' => 'MSISDN',
                    'partyId' => ltrim($phoneNumber, '+'),
                ],
                'payerMessage' => 'Kikuubo Suppliers order',
                'payeeNote' => $externalId,
            ]
        );

        return [
            'accepted' => $response['http_status'] === 202,
            'http_status' => $response['http_status'],
            'reference_id' => $referenceId,
            'payment_status' => 'NOT_VERIFIED',
        ];
    }

    public function transactionStatus(string $referenceId): array
    {
        if (!preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
            $referenceId
        )) {
            throw new InvalidArgumentException('Invalid MTN reference');
        }

        $token = $this->accessToken();

        return $this->request(
            'GET',
            '/collection/v1_0/requesttopay/' . $referenceId,
            [
                'Authorization: Bearer ' . $token,
                'Ocp-Apim-Subscription-Key: ' . $this->subscriptionKey,
                'X-Target-Environment: ' . $this->environment,
            ]
        );
    }
}
