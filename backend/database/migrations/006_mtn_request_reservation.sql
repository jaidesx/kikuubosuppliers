ALTER TABLE payment_transactions
    ADD COLUMN provider_request_reference CHAR(36)
        CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD UNIQUE KEY uq_provider_request_reference
        (provider, provider_request_reference);
