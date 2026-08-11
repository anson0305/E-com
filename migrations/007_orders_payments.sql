CREATE TABLE orders (
    id                          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                     INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                      VARCHAR(32) NOT NULL
        CHECK (status IN ('awaiting_payment', 'paid', 'payment_failed', 'cancelled', 'expired')),
    currency                    CHAR(3) NOT NULL DEFAULT 'usd',
    amount_cents                INT NOT NULL CHECK (amount_cents >= 0),
    idempotency_key             VARCHAR(255) NOT NULL,
    stripe_payment_intent_id    VARCHAR(255) UNIQUE,
    reservation_expires_at      TIMESTAMPTZ NOT NULL,
    inventory_released_at       TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX orders_pending_reservation_idx
    ON orders (reservation_expires_at)
    WHERE status = 'awaiting_payment' AND inventory_released_at IS NULL;

CREATE TABLE order_items (
    id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id            INT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    product_id          INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name        VARCHAR(128) NOT NULL,
    unit_amount_cents   INT NOT NULL CHECK (unit_amount_cents >= 0),
    quantity            INT NOT NULL CHECK (quantity > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (order_id, product_id)
);

CREATE TABLE payment_webhook_events (
    stripe_event_id             VARCHAR(255) PRIMARY KEY,
    event_type                  VARCHAR(255) NOT NULL,
    stripe_payment_intent_id    VARCHAR(255) NOT NULL,
    received_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

