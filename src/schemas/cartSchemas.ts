import { z } from 'zod';

export const addCartItemBodySchema = z.strictObject({
    product_id: z.number().int().positive(),
    quantity: z.number().int().min(1).max(99),
});

export const updateCartItemBodySchema = z.strictObject({
    quantity: z.number().int().min(1).max(99),
});

export const cartItemParamsSchema = z.strictObject({
    id: z.string().regex(/^[1-9]\d*$/, 'id must be a positive integer'),
});

export type AddCartItemBody = z.infer<typeof addCartItemBodySchema>;
export type UpdateCartItemBody = z.infer<typeof updateCartItemBodySchema>;
