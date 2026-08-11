import { describe, expect, it, vi } from 'vitest';
import {
    PaymentProviderError,
    PaymentService,
} from '../../../src/services/paymentService.js';

const pendingOrder = {
    id: 42,
    user_id: 1,
    status: 'awaiting_payment' as const,
    currency: 'usd',
    amount_cents: 2599,
    idempotency_key: 'checkout-42',
    stripe_payment_intent_id: null,
    reservation_expires_at: new Date(Date.now() + 60_000),
    inventory_released_at: null,
    created_at: new Date(),
    updated_at: new Date(),
};

function makeRepo() {
    return {
        createOrGetReservedOrder: vi.fn().mockResolvedValue({ order: pendingOrder, created: true }),
        attachPaymentIntent: vi.fn().mockResolvedValue(undefined),
        releaseOrderInventory: vi.fn().mockResolvedValue(true),
        getOrderForUser: vi.fn(),
        processWebhookEvent: vi.fn().mockResolvedValue(true),
        getExpiredPendingOrders: vi.fn().mockResolvedValue([]),
    };
}

describe('PaymentService', () => {
    it('creates one PaymentIntent from server-calculated order data and returns only its client secret', async () => {
        const repo = makeRepo();
        const create = vi.fn().mockResolvedValue({ id: 'pi_test_42', client_secret: 'pi_test_42_secret' });
        const service = new PaymentService(repo as never, () => ({
            paymentIntents: { create, retrieve: vi.fn(), cancel: vi.fn() },
        }) as never);

        const result = await service.checkout(1, 'checkout-42');

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 2599,
                currency: 'usd',
                metadata: { order_id: '42' },
            }),
            { idempotencyKey: 'order-payment-intent-42' },
        );
        expect(repo.attachPaymentIntent).toHaveBeenCalledWith(42, 'pi_test_42');
        expect(result).toMatchObject({
            order_id: 42,
            amount_cents: 2599,
            client_secret: 'pi_test_42_secret',
        });
    });

    it('releases the reservation when Stripe cannot create a usable PaymentIntent', async () => {
        const repo = makeRepo();
        const service = new PaymentService(repo as never, () => ({
            paymentIntents: { create: vi.fn().mockRejectedValue(new Error('Stripe unavailable')), retrieve: vi.fn(), cancel: vi.fn() },
        }) as never);

        await expect(service.checkout(1, 'checkout-42')).rejects.toBeInstanceOf(PaymentProviderError);
        expect(repo.releaseOrderInventory).toHaveBeenCalledWith(42, 'payment_failed');
    });

    it('passes a successful webhook through the idempotent repository transaction', async () => {
        const repo = makeRepo();
        const service = new PaymentService(repo as never, vi.fn() as never);

        const handled = await service.handleWebhook({
            id: 'evt_123',
            type: 'payment_intent.succeeded',
            data: { object: { id: 'pi_test_42' } },
        } as never);

        expect(handled).toBe(true);
        expect(repo.processWebhookEvent).toHaveBeenCalledWith(
            'evt_123',
            'payment_intent.succeeded',
            'pi_test_42',
        );
    });
});
