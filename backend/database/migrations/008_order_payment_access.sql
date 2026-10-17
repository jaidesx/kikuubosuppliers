CREATE TABLE order_payment_access (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    order_id BIGINT UNSIGNED NOT NULL,

    token_hash CHAR(64)
        CHARACTER SET ascii
        COLLATE ascii_bin NOT NULL,

    expires_at DATETIME NOT NULL,

    revoked_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_access_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_payment_access_token
        UNIQUE (token_hash),

    INDEX idx_payment_access_order (order_id),

    INDEX idx_payment_access_expiry (expires_at)
) ENGINE=InnoDB;
