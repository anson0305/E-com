import { z } from 'zod';

export const categoryIdParamsSchema = z.strictObject({
    id: z.string().regex(/^[1-9]\d*$/, 'id must be a positive integer'),
});

export const createCategoryBodySchema = z.strictObject({
    name: z.string().trim().min(1).max(64),
    parent_id: z.number().int().positive().optional(),
});

export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
