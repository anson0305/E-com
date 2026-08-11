import { z } from 'zod';

export const orderIdParamsSchema = z.strictObject({
    id: z.string().regex(/^[1-9]\d*$/, 'id must be a positive integer'),
});

export const checkoutHeadersSchema = z.strictObject({
    idempotency_key: z.string().trim().min(1).max(255).optional(),
});

export type CheckoutHeaders = z.infer<typeof checkoutHeadersSchema>;
