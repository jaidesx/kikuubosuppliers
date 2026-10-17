CREATE TABLE supplier_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE supplier_login_limits (
    bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    window_start BIGINT UNSIGNED NOT NULL,
    attempts INT UNSIGNED NOT NULL,
    PRIMARY KEY (bucket, window_start)
) ENGINE=InnoDB;

ALTER TABLE payment_transactions
    ADD COLUMN payment_access_id BIGINT UNSIGNED NULL,
    ADD CONSTRAINT fk_payment_access FOREIGN KEY (payment_access_id)
        REFERENCES order_payment_access(id) ON DELETE RESTRICT;
