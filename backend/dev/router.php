<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (!is_string($path)) {
    http_response_code(400);
    exit;
}

$path = rawurldecode($path);

if (
    str_contains($path, "\0") ||
    str_contains($path, '\\') ||
    preg_match('~(^|/)\.\.?(/|$)~', $path)
) {
    http_response_code(403);
    exit;
}

$segments = explode('/', trim($path, '/'));

$blocked = [
    'backend',
    '.env',
    '.git',
    '.gitignore',
    'compose.yaml',
];

if (
    in_array($segments[0], $blocked, true) ||
    str_starts_with($segments[0], '.env.')
) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

return false;
