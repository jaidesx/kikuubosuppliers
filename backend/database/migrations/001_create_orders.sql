CREATE TABLE orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    order_reference VARCHAR(40) NOT NULL UNIQUE,

    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    delivery_location VARCHAR(300) NOT NULL,

    preferred_payment_method VARCHAR(20) NOT NULL,

    customer_notes TEXT NULL,

    estimated_subtotal_ugx BIGINT UNSIGNED NOT NULL DEFAULT 0,
    confirmed_total_ugx BIGINT UNSIGNED NULL,

    order_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    order_id BIGINT UNSIGNED NOT NULL,
    product_id VARCHAR(100) NOT NULL,

    product_name VARCHAR(255) NOT NULL,
    quantity INT UNSIGNED NOT NULL,

    unit_price_ugx BIGINT UNSIGNED NULL,
    line_total_ugx BIGINT UNSIGNED NULL,

    requires_quotation BOOLEAN NOT NULL DEFAULT FALSE,

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT
);