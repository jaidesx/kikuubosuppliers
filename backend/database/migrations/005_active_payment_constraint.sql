ALTER TABLE payment_transactions
    ADD COLUMN active_order_id BIGINT UNSIGNED
        GENERATED ALWAYS AS (
            CASE
                WHEN status IN ('CREATED', 'PENDING')
                THEN order_id
                ELSE NULL
            END
        ) STORED,
    ADD UNIQUE KEY uq_active_payment_per_order (active_order_id);
