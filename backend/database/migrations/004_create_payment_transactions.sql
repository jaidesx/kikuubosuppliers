CREATE TABLE payment_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    order_id BIGINT UNSIGNED NOT NULL,

    payment_reference VARCHAR(50) NOT NULL UNIQUE,

    provider VARCHAR(20) NOT NULL,

    provider_transaction_id VARCHAR(150) NULL,

    phone_number VARCHAR(30) NOT NULL,

    amount_ugx BIGINT UNSIGNED NOT NULL,

    currency CHAR(3) NOT NULL DEFAULT 'UGX',

    status VARCHAR(30) NOT NULL DEFAULT 'CREATED',

    provider_status VARCHAR(100) NULL,

    failure_reason VARCHAR(255) NULL,

    idempotency_key CHAR(36)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    verified_at TIMESTAMP NULL,

    CONSTRAINT fk_payment_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_payment_idempotency
        UNIQUE (idempotency_key),

    CONSTRAINT uq_payment_provider_transaction
        UNIQUE (provider, provider_transaction_id),

    CONSTRAINT chk_payment_amount
        CHECK (amount_ugx > 0),

    CONSTRAINT chk_payment_provider
        CHECK (provider IN ('mtn', 'airtel')),

    CONSTRAINT chk_payment_status
        CHECK (
            status IN (
                'CREATED',
                'PENDING',
                'SUCCESSFUL',
                'FAILED',
                'CANCELLED'
            )
        )
) ENGINE=InnoDB;
