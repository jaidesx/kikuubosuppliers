<?php
declare(strict_types=1);

final class RateLimiter
{
    public function __construct(
        private PDO $pdo,
        private int $limit = 30,
        private int $windowSeconds = 60
    ) {
        if ($limit < 1 || $windowSeconds < 1) {
            throw new InvalidArgumentException('Invalid rate-limit configuration');
        }
    }

    public function consume(string $clientIp): array
    {
        if (filter_var($clientIp, FILTER_VALIDATE_IP) === false) {
            throw new InvalidArgumentException('Invalid client IP');
        }

        $now = time();

        $windowStart = intdiv($now, $this->windowSeconds)
            * $this->windowSeconds;

        $clientHash = hash('sha256', $clientIp);

        $statement = $this->pdo->prepare(
            'INSERT INTO api_rate_limits (
                client_hash, window_start, request_count
            ) VALUES (?, ?, 1)
            ON DUPLICATE KEY UPDATE
                request_count = request_count + 1'
        );

        $statement->execute([$clientHash, $windowStart]);

        $read = $this->pdo->prepare(
            'SELECT request_count
             FROM api_rate_limits
             WHERE client_hash = ? AND window_start = ?'
        );

        $read->execute([$clientHash, $windowStart]);

        $count = (int) $read->fetchColumn();

        return [
            'allowed' => $count <= $this->limit,
            'remaining' => max(0, $this->limit - $count),
            'retry_after' => max(
                1,
                $windowStart + $this->windowSeconds - $now
            ),
        ];
    }
}
