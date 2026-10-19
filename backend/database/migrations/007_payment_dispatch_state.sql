ALTER TABLE payment_transactions
    ADD COLUMN dispatch_state VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
    ADD COLUMN dispatch_started_at TIMESTAMP NULL,
    ADD COLUMN dispatch_completed_at TIMESTAMP NULL,
    ADD CONSTRAINT chk_dispatch_state CHECK (
        dispatch_state IN (
            'RESERVED',
            'DISPATCHING',
            'ACCEPTED',
            'RECONCILIATION_REQUIRED'
        )
    );
