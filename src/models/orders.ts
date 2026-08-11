export type OrderStatus =
    | 'awaiting_payment'
    | 'paid'
    | 'payment_failed'
    | 'cancelled'
    | 'expired';

export interface OrderItem {
    id: number;
    order_id: number;
    product_id: number;
    product_name: string;
    unit_amount_cents: number;
    quantity: number;
    created_at: Date;
}

export interface Order {
    id: number;
    user_id: number;
    status: OrderStatus;
    currency: string;
    amount_cents: number;
    idempotency_key: string;
    stripe_payment_intent_id: string | null;
    reservation_expires_at: Date;
    inventory_released_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface OrderWithItems extends Order {
    items: OrderItem[];
}

export interface CheckoutResponse {
    order_id: number;
    status: OrderStatus;
    amount_cents: number;
    currency: string;
    client_secret: string;
    reservation_expires_at: Date;
}
