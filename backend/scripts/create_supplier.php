<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/database.php';
// Supply via protected stdin, never command-line password arguments or a web endpoint.
$username = strtolower(trim($argv[1] ?? ''));
if (!preg_match('/^[a-z0-9_.-]{3,100}$/', $username)) { exit("Usage: php create_supplier.php username < protected-password-file\n"); }
$password = rtrim(stream_get_contents(STDIN), "\r\n");
if (strlen($password) < 14 || strlen($password) > 72) { exit("Password must be 14–72 bytes\n"); }
$pdo = databaseConnection();
$pdo->prepare('INSERT INTO supplier_users (username, password_hash) VALUES (?, ?)')
    ->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
echo "Supplier created.\n";
