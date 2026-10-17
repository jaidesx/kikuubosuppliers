<?php
declare(strict_types=1);

function kikuuboBackendPath(): string
{
    $configured = getenv('KIKUUBO_BACKEND_PATH');

    if (is_string($configured) && $configured !== '') {
        $path = realpath($configured);
    } else {
        $path = realpath(__DIR__ . '/../../backend');
    }

    if ($path === false || !is_dir($path)) {
        throw new RuntimeException('Backend directory unavailable');
    }

    return $path;
}
