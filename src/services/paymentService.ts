import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { CheckoutResponse, OrderWithItems } from '../models/orders.js';
import {
    CartIsEmptyError,
    CheckoutOutOfStockError,
    PaymentRepository,
    paymentRepository,
} from '../repositories/paymentRepository.js';
import { getStripeClient } from './stripe.js';

export { CartIsEmptyError, CheckoutOutOfStockError };

export class OrderNotFoundError extends Error {
    constructor() {
        super('order not found');
        this.name = 'OrderNotFoundError';
    }
}

export class OrderNotPayableError extends Error {
    constructor() {
        super('order is no longer awaiting payment');
        this.name = 'OrderNotPayableError';
    }
}

export class PaymentProviderError extends Error {
    constructor() {
        super('unable to start payment; inventory reservation was released');
        this.name = 'PaymentProviderError';
    }
}

export class PaymentService {
    constructor(
        private paymentRepo: PaymentRepository = paymentRepository,
        private stripeProvider: () => Stripe = getStripeClient,
    ) {}

    private toCheckoutResponse(order: {
        id: number;
        amount_cents: number;
        currency: string;
        reservation_expires_at: Date;
    }, clientSecret: string): CheckoutResponse {
        return {
            order_id: order.id,
            status: 'awaiting_payment',
            amount_cents: order.amount_cents,
            currency: order.currency,
            client_secret: clientSecret,
            reservation_expires_at: order.reservation_expires_at,
        };
    }

    async checkout(userId: number, requestedIdempotencyKey?: string): Promise<CheckoutResponse> {
        const idempotencyKey = requestedIdempotencyKey || randomUUID();
        const { order } = await this.paymentRepo.createOrGetReservedOrder(userId, idempotencyKey);

        if (order.status !== 'awaiting_payment' || order.inventory_released_at) {
            throw new OrderNotPayableError();
        }
        if (order.reservation_expires_at <= new Date()) {
            await this.paymentRepo.releaseOrderInventory(order.id, 'expired');
            throw new OrderNotPayableError();
        }

        const stripe = this.stripeProvider();
        try {
            const paymentIntent = order.stripe_payment_intent_id
                ? await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id)
                : await stripe.paymentIntents.create(
                    {
                        amount: order.amount_cents,
                        currency: order.currency,
                        payment_method_types: ['card'],
                        metadata: { order_id: String(order.id) },
                    },
                    { idempotencyKey: `order-payment-intent-${order.id}` },
                );

            if (!order.stripe_payment_intent_id) {
                await this.paymentRepo.attachPaymentIntent(order.id, paymentIntent.id);
            }
            if (!paymentIntent.client_secret) {
                throw new Error('Stripe did not return a client secret');
            }
            return this.toCheckoutResponse(order, paymentIntent.client_secret);
        } catch (error) {
            // A payment intent was not usable, so make the reserved stock purchasable again.
            await this.paymentRepo.releaseOrderInventory(order.id, 'payment_failed');
            if (error instanceof PaymentProviderError) throw error;
            throw new PaymentProviderError();
        }
    }

    async getOrder(userId: number, orderId: number): Promise<OrderWithItems> {
        const order = await this.paymentRepo.getOrderForUser(orderId, userId);
        if (!order) throw new OrderNotFoundError();
        return order;
    }

    async cancelOrder(userId: number, orderId: number): Promise<void> {
        const order = await this.paymentRepo.getOrderForUser(orderId, userId);
        if (!order) throw new OrderNotFoundError();
        if (order.status !== 'awaiting_payment' || order.inventory_released_at) {
            throw new OrderNotPayableError();
        }

        if (order.stripe_payment_intent_id) {
            await this.stripeProvider().paymentIntents.cancel(order.stripe_payment_intent_id);
        }
        await this.paymentRepo.releaseOrderInventory(order.id, 'cancelled');
    }

    async handleWebhook(event: Stripe.Event): Promise<boolean> {
        if (!['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled'].includes(event.type)) {
            return false;
        }
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        return this.paymentRepo.processWebhookEvent(event.id, event.type, paymentIntent.id);
    }

    async releaseExpiredReservations(): Promise<number> {
        const expiredOrders = await this.paymentRepo.getExpiredPendingOrders();
        let released = 0;
        for (const order of expiredOrders) {
            try {
                if (order.stripe_payment_intent_id) {
                    await this.stripeProvider().paymentIntents.cancel(order.stripe_payment_intent_id);
                }
                if (await this.paymentRepo.releaseOrderInventory(order.id, 'expired')) released += 1;
            } catch (error) {
                // A PaymentIntent that has already succeeded must be handled by its webhook, never by releasing stock.
                console.error(`Unable to expire payment order ${order.id}:`, error);
            }
        }
        return released;
    }
}

export const paymentService = new PaymentService();
