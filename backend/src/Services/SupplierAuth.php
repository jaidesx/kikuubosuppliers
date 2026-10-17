<?php
declare(strict_types=1);

final class SupplierAuth
{
    public function __construct(private PDO $pdo) {}

    public static function startSession(): void
    {
        $https = ($_SERVER['HTTPS'] ?? '') === 'on';
        $local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)
            && getenv('KIKUUBO_APP_ENV') === 'development';
        if (!$https && !$local) { throw new RuntimeException('HTTPS required'); }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_name('kikuubo_supplier');
        session_set_cookie_params(['lifetime' => 0, 'path' => '/api/v1/supplier/',
            'secure' => !$local || $https, 'httponly' => true, 'samesite' => 'Strict']);
        session_start();
        if (isset($_SESSION['last_seen']) && (time() - $_SESSION['last_seen'] > 1800
            || time() - ($_SESSION['signed_in'] ?? 0) > 28800)) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    }

    public function login(string $username, string $password, string $ip): bool
    {
        $username = strtolower(trim($username));
        $window = intdiv(time(), 900) * 900;
        // Separate account and address buckets limit distributed guessing and account spraying.
        foreach (['account:' . $username => 10, 'ip:' . $ip => 30] as $key => $limit) {
            $bucket = hash('sha256', $key);
            $q = $this->pdo->prepare('INSERT INTO supplier_login_limits VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE attempts = attempts + 1');
            $q->execute([$bucket, $window]);
            $q = $this->pdo->prepare('SELECT attempts FROM supplier_login_limits WHERE bucket = ? AND window_start = ?');
            $q->execute([$bucket, $window]);
            if ((int) $q->fetchColumn() > $limit) { return false; }
        }
        $q = $this->pdo->prepare('SELECT id, password_hash, active FROM supplier_users WHERE username = ?');
        $q->execute([$username]);
        $user = $q->fetch();
        $dummy = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        $valid = password_verify($password, $user['password_hash'] ?? $dummy);
        if (!$user || !$valid || !(bool) $user['active']) { return false; }
        session_regenerate_id(true);
        $_SESSION = ['supplier_id' => (int) $user['id'], 'signed_in' => time(),
            'last_seen' => time(), 'csrf' => bin2hex(random_bytes(32))];
        return true;
    }

    public function authenticated(): bool
    {
        $q = $this->pdo->prepare('SELECT active FROM supplier_users WHERE id = ?');
        $q->execute([$_SESSION['supplier_id'] ?? 0]);
        if (!(bool) $q->fetchColumn()) { return false; }
        $_SESSION['last_seen'] = time();
        return true;
    }

    public static function csrf(string $token): bool
    {
        return $token !== '' && hash_equals($_SESSION['csrf'] ?? '', $token);
    }
}
