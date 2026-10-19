<?php
declare(strict_types=1);

function loadEnvironment(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        throw new RuntimeException('Environment configuration unavailable');
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);

        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        $parts = explode('=', $line, 2);

        if (count($parts) !== 2) {
            throw new RuntimeException('Invalid environment configuration');
        }

        [$key, $value] = $parts;

        $key = trim($key);
        $value = trim($value);

        if (!preg_match('/^[A-Z][A-Z0-9_]*$/', $key)) {
            throw new RuntimeException('Invalid environment variable name');
        }

        if (getenv($key) === false) {
            putenv("$key=$value");
        }
    }
}
