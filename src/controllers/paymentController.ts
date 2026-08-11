import type { Request, Response } from 'express';
import {
    CartIsEmptyError,
    CheckoutOutOfStockError,
    OrderNotFoundError,
    OrderNotPayableError,
    PaymentProviderError,
    paymentService,
} from '../services/paymentService.js';
import { PaymentConfigurationError, getStripeClient, getWebhookSecret } from '../services/stripe.js';

function userIdFromRequest(req: Request): number {
    return Number(req.jwtPayload!.userId);
}

export async function checkout(req: Request, res: Response) {
    try {
        const result = await paymentService.checkout(userIdFromRequest(req), req.get('Idempotency-Key') ?? undefined);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        if (error instanceof CartIsEmptyError) {
            res.status(400).json({ success: false, error: error.message });
        } else if (error instanceof CheckoutOutOfStockError) {
            res.status(409).json({ success: false, error: error.message });
        } else if (error instanceof OrderNotPayableError) {
            res.status(409).json({ success: false, error: error.message });
        } else if (error instanceof PaymentConfigurationError || error instanceof PaymentProviderError) {
            res.status(503).json({ success: false, error: error.message });
        } else {
            console.error('checkout error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}

export async function getOrder(req: Request, res: Response) {
    try {
        const order = await paymentService.getOrder(userIdFromRequest(req), Number(req.params.id));
        res.json({ success: true, data: order });
    } catch (error) {
        if (error instanceof OrderNotFoundError) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('get order error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}

export async function cancelOrder(req: Request, res: Response) {
    try {
        await paymentService.cancelOrder(userIdFromRequest(req), Number(req.params.id));
        res.json({ success: true, data: { message: 'payment cancelled and inventory released' } });
    } catch (error) {
        if (error instanceof OrderNotFoundError) {
            res.status(404).json({ success: false, error: error.message });
        } else if (error instanceof OrderNotPayableError) {
            res.status(409).json({ success: false, error: error.message });
        } else {
            console.error('cancel order error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}

export async function releaseExpiredReservations(_req: Request, res: Response) {
    try {
        const released = await paymentService.releaseExpiredReservations();
        res.json({ success: true, data: { released } });
    } catch (error) {
        console.error('release expired reservations error:', error);
        res.status(500).json({ success: false, error: 'unexpected error' });
    }
}

export async function stripeWebhook(req: Request, res: Response) {
    const signature = req.get('Stripe-Signature');
    if (!signature || !Buffer.isBuffer(req.body)) {
        res.status(400).json({ success: false, error: 'invalid Stripe webhook payload' });
        return;
    }

    try {
        const event = getStripeClient().webhooks.constructEvent(req.body, signature, getWebhookSecret());
        await paymentService.handleWebhook(event);
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(400).json({ success: false, error: 'invalid Stripe webhook signature or payload' });
    }
}
