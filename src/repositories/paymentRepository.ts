import type { Pool, PoolClient } from 'pg';
import { pool } from '../config/db.js';
import type { Order, OrderItem, OrderStatus, OrderWithItems } from '../models/orders.js';

const RESERVATION_MINUTES = 15;

export class CartIsEmptyError extends Error {
    constructor() {
        super('cart is empty');
        this.name = 'CartIsEmptyError';
    }
}

export class CheckoutOutOfStockError extends Error {
    constructor() {
        super('one or more products are out of stock');
        this.name = 'CheckoutOutOfStockError';
    }
}

interface LockedCartItem {
    product_id: number;
    quantity: number;
    name: string;
    price: number;
    stock: number;
}

function toCents(price: number): number {
    const cents = Math.round(Number(price) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) {
        throw new Error('product price cannot be represented in cents');
    }
    return cents;
}

export class PaymentRepository {
    constructor(private db: Pool = pool) {}

    private async getOrderItems(client: PoolClient, orderId: number): Promise<OrderItem[]> {
        const { rows } = await client.query<OrderItem>(
            'SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_id',
            [orderId],
        );
        return rows;
    }

    async getOrderForUser(orderId: number, userId: number): Promise<OrderWithItems | null> {
        const client = await this.db.connect();
        try {
            const { rows } = await client.query<Order>(
                'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
                [orderId, userId],
            );
            if (!rows[0]) return null;
            return { ...rows[0], items: await this.getOrderItems(client, orderId) };
        } finally {
            client.release();
        }
    }

    async createOrGetReservedOrder(userId: number, idempotencyKey: string): Promise<{ order: Order; created: boolean }> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query<Order>(
                `SELECT * FROM orders
                 WHERE user_id = $1 AND idempotency_key = $2
                 FOR UPDATE`,
                [userId, idempotencyKey],
            );
            if (existing.rows[0]) {
                await client.query('COMMIT');
                return { order: existing.rows[0], created: false };
            }

            const cart = await client.query<{ id: number }>(
                'SELECT id FROM carts WHERE user_id = $1 FOR UPDATE',
                [userId],
            );
            if (!cart.rows[0]) throw new CartIsEmptyError();

            // Lock products in a stable order. This serializes competing checkouts for the same stock.
            const items = await client.query<LockedCartItem>(
                `SELECT ci.product_id, ci.quantity, p.name, p.price, p.stock
                 FROM cart_items ci
                 JOIN products p ON p.id = ci.product_id
                 WHERE ci.cart_id = $1 AND p.is_active = true
                 ORDER BY ci.product_id
                 FOR UPDATE OF p`,
                [cart.rows[0].id],
            );
            if (items.rows.length === 0) throw new CartIsEmptyError();

            if (items.rows.some(item => item.quantity > item.stock)) {
                throw new CheckoutOutOfStockError();
            }

            const amountCents = items.rows.reduce(
                (total, item) => total + toCents(item.price) * item.quantity,
                0,
            );
            if (!Number.isSafeInteger(amountCents)) {
                throw new Error('order amount is too large');
            }

            const orderResult = await client.query<Order>(
                `INSERT INTO orders
                    (user_id, status, currency, amount_cents, idempotency_key, reservation_expires_at)
                 VALUES ($1, 'awaiting_payment', 'usd', $2, $3, NOW() + INTERVAL '${RESERVATION_MINUTES} minutes')
                 RETURNING *`,
                [userId, amountCents, idempotencyKey],
            );
            const order = orderResult.rows[0];

            for (const item of items.rows) {
                const decremented = await client.query(
                    `UPDATE products SET stock = stock - $2, updated_at = NOW()
                     WHERE id = $1 AND stock >= $2`,
                    [item.product_id, item.quantity],
                );
                if (decremented.rowCount !== 1) throw new CheckoutOutOfStockError();

                await client.query(
                    `INSERT INTO order_items
                        (order_id, product_id, product_name, unit_amount_cents, quantity)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [order.id, item.product_id, item.name, toCents(item.price), item.quantity],
                );
            }

            await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.rows[0].id]);
            await client.query('COMMIT');
            return { order, created: true };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async attachPaymentIntent(orderId: number, paymentIntentId: string): Promise<void> {
        await this.db.query(
            `UPDATE orders
             SET stripe_payment_intent_id = $2, updated_at = NOW()
             WHERE id = $1 AND stripe_payment_intent_id IS NULL`,
            [orderId, paymentIntentId],
        );
    }

    private async releaseOrderInventoryInTransaction(
        client: PoolClient,
        orderId: number,
        status: Extract<OrderStatus, 'payment_failed' | 'cancelled' | 'expired'>,
    ): Promise<boolean> {
        const orderResult = await client.query<Order>(
            'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
            [orderId],
        );
        const order = orderResult.rows[0];
        if (!order || order.status !== 'awaiting_payment' || order.inventory_released_at) {
            return false;
        }

        const items = await this.getOrderItems(client, orderId);
        for (const item of items) {
            await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
            await client.query(
                'UPDATE products SET stock = stock + $2, updated_at = NOW() WHERE id = $1',
                [item.product_id, item.quantity],
            );
        }
        await client.query(
            `UPDATE orders
             SET status = $2, inventory_released_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [orderId, status],
        );
        return true;
    }

    async releaseOrderInventory(orderId: number, status: Extract<OrderStatus, 'payment_failed' | 'cancelled' | 'expired'>): Promise<boolean> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const released = await this.releaseOrderInventoryInTransaction(client, orderId, status);
            await client.query('COMMIT');
            return released;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async markOrderPaid(paymentIntentId: string): Promise<void> {
        await this.db.query(
            `UPDATE orders
             SET status = 'paid', updated_at = NOW()
             WHERE stripe_payment_intent_id = $1
               AND status = 'awaiting_payment'
               AND inventory_released_at IS NULL`,
            [paymentIntentId],
        );
    }

    async processWebhookEvent(
        eventId: string,
        eventType: string,
        paymentIntentId: string,
    ): Promise<boolean> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const inserted = await client.query(
                `INSERT INTO payment_webhook_events (stripe_event_id, event_type, stripe_payment_intent_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (stripe_event_id) DO NOTHING`,
                [eventId, eventType, paymentIntentId],
            );
            if (inserted.rowCount !== 1) {
                await client.query('COMMIT');
                return false;
            }

            if (eventType === 'payment_intent.succeeded') {
                await client.query(
                    `UPDATE orders
                     SET status = 'paid', updated_at = NOW()
                     WHERE stripe_payment_intent_id = $1
                       AND status = 'awaiting_payment'
                       AND inventory_released_at IS NULL`,
                    [paymentIntentId],
                );
            } else if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
                const order = await client.query<Order>(
                    'SELECT * FROM orders WHERE stripe_payment_intent_id = $1',
                    [paymentIntentId],
                );
                if (order.rows[0]) {
                    await this.releaseOrderInventoryInTransaction(client, order.rows[0].id, 'payment_failed');
                }
            }
            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getOrderByPaymentIntent(paymentIntentId: string): Promise<Order | null> {
        const { rows } = await this.db.query<Order>(
            'SELECT * FROM orders WHERE stripe_payment_intent_id = $1',
            [paymentIntentId],
        );
        return rows[0] ?? null;
    }

    async getExpiredPendingOrders(): Promise<Order[]> {
        const { rows } = await this.db.query<Order>(
            `SELECT * FROM orders
             WHERE status = 'awaiting_payment'
               AND inventory_released_at IS NULL
               AND reservation_expires_at <= NOW()
             ORDER BY id`,
        );
        return rows;
    }
}

export const paymentRepository = new PaymentRepository();
