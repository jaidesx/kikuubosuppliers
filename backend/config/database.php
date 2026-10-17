<?php
declare(strict_types=1);

require_once __DIR__ . '/env.php';

function databaseConnection(): PDO
{
    $envPath = getenv('KIKUUBO_ENV_PATH') ?: dirname(__DIR__, 2) . '/.env';

    $required = [
        'KIKUUBO_DB_HOST',
        'KIKUUBO_DB_PORT',
        'KIKUUBO_DB_NAME',
        'KIKUUBO_DB_USER',
        'KIKUUBO_DB_PASSWORD',
    ];

    $missing = array_filter(
        $required,
        static fn (string $key): bool =>
            getenv($key) === false || getenv($key) === ''
    );

    if ($missing !== [] && is_readable($envPath)) {
        loadEnvironment($envPath);
    }

    $host = getenv('KIKUUBO_DB_HOST');
    $port = getenv('KIKUUBO_DB_PORT');
    $name = getenv('KIKUUBO_DB_NAME');
    $user = getenv('KIKUUBO_DB_USER');
    $password = getenv('KIKUUBO_DB_PASSWORD');

    if (!$host || !$port || !$name || !$user || !$password) {
        throw new RuntimeException('Database configuration is incomplete');
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $host,
        $port,
        $name
    );

    return new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}
