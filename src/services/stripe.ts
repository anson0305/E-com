import Stripe from 'stripe';

export class PaymentConfigurationError extends Error {
    constructor(message = 'STRIPE_SECRET_KEY is not configured') {
        super(message);
        this.name = 'PaymentConfigurationError';
    }
}

let stripeClient: Stripe | undefined;

export function getStripeClient(): Stripe {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new PaymentConfigurationError();
    }

    stripeClient ??= new Stripe(secretKey);
    return stripeClient;
}

export function getWebhookSecret(): string {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new PaymentConfigurationError('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return webhookSecret;
}
