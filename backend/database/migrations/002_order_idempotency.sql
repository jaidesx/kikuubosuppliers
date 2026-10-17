ALTER TABLE orders
    ADD COLUMN idempotency_key CHAR(36)
        CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN request_hash CHAR(64)
        CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD UNIQUE KEY uq_orders_idempotency_key (idempotency_key);
