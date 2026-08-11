import { z } from 'zod';

const productFields = {
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().max(1024),
    price: z.number().finite().nonnegative(),
    stock: z.number().int().nonnegative(),
    image_url: z.string().trim().max(1024).optional(),
    category_id: z.number().int().positive(),
    is_active: z.boolean(),
};

export const productIdParamsSchema = z.strictObject({
    id: z.string().regex(/^[1-9]\d*$/, 'id must be a positive integer'),
});

export const listProductsQuerySchema = z.strictObject({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['name', 'price', 'stock', 'created_at']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    category_id: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(128).optional(),
});

export const searchProductsQuerySchema = z.strictObject({
    id: z.string().regex(/^[1-9]\d*$/, 'id must be a positive integer').optional(),
    category: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(128).optional(),
}).refine(
    query => Object.values(query).filter(value => value !== undefined).length === 1,
    { error: 'provide exactly one of id, category, or name' },
);

export const createProductBodySchema = z.strictObject({
    name: productFields.name,
    description: productFields.description.default(''),
    price: productFields.price,
    stock: productFields.stock,
    image_url: productFields.image_url,
    category_id: productFields.category_id,
});

export const updateProductBodySchema = z.strictObject({
    name: productFields.name.optional(),
    description: productFields.description.optional(),
    price: productFields.price.optional(),
    stock: productFields.stock.optional(),
    image_url: productFields.image_url,
    category_id: productFields.category_id.optional(),
    is_active: productFields.is_active.optional(),
}).refine(
    product => Object.values(product).some(value => value !== undefined),
    { error: 'at least one product field is required' },
);

export type CreateProductBody = z.infer<typeof createProductBodySchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
export type SearchProductsQuery = z.infer<typeof searchProductsQuerySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
