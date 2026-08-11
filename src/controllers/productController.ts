import type { Request, Response } from 'express';
import { productService, UnknownProductID, NoSuchProduct } from '../services/productService.js';
import { CategoryNotFoundError } from '../services/categoryService.js';
import {
    listProductsQuerySchema,
    type CreateProductBody,
    type ListProductsQuery,
    type SearchProductsQuery,
    type UpdateProductBody,
} from '../schemas/productSchemas.js';

export class QueryIsMissing extends Error {
    constructor() {
        super("no query parameter is provided");
        this.name = "QueryIsMissing";
    }
}

export async function searchProduct(
    _req: Request<{}, unknown, unknown, SearchProductsQuery>,
    res: Response,
) {
    try {
        const { id, category, name } = (res.locals?.validatedQuery ?? _req.query) as SearchProductsQuery;
        if (id !== undefined) {
            const product = await productService.findById(Number.parseInt(id));
            res.json({ success: true, data: product });
        } else if (category !== undefined) {
            const productList = await productService.findByCategory(category);
            res.json({ success: true, data: productList });
        } else if (name !== undefined) {
            const product = await productService.findByName(name);
            res.json({ success: true, data: product });
        } else {
            throw new QueryIsMissing();
        }
    } catch (error) {
        if (error instanceof QueryIsMissing) {
            res.status(400).json({ success: false, error: error.message });
        } else if (error instanceof UnknownProductID || error instanceof NoSuchProduct) {
            res.status(404).json({ success: false, error: error.message });
        } else if (error instanceof CategoryNotFoundError) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('searchProduct error:', error);
            res.status(500).json({ success: false, error: "unexpected error" });
        }
    }
}

export async function findAllProduct(
    req: Request,
    res: Response,
) {
    try {
        const query = (res.locals?.validatedQuery ?? listProductsQuerySchema.parse(req.query)) as ListProductsQuery;
        const result = await productService.listProducts(query);
        res.json({
            success: true,
            data: result.items,
            pagination: {
                page: query.page,
                limit: query.limit,
                total: result.total,
                total_pages: Math.ceil(result.total / query.limit),
            },
        });
    } catch (error) {
        console.error('findAllProduct error:', error);
        res.status(500).json({ success: false, error: "unexpected error" });
    }
}

export async function createProduct(req: Request<{}, unknown, CreateProductBody>, res: Response) {
    try {
        const { name, description, price, stock, image_url, category_id } = req.body;

        if (!name || price === undefined || stock === undefined || !category_id) {
            res.status(400).json({
                success: false,
                error: 'name, price, stock, and category_id are required',
            });
            return;
        }

        const product = await productService.createProduct({
            name,
            description: description ?? '',
            price,
            stock,
            image_url,
            category_id,
        });

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        console.error('createProduct error:', error);
        res.status(500).json({ success: false, error: "unexpected error" });
    }
}

export async function updateProduct(
    req: Request<{ id: string }, unknown, UpdateProductBody>,
    res: Response,
) {
    try {
        const id = Number.parseInt(req.params.id as string);
        if (!id) {
            res.status(400).json({ success: false, error: 'valid product id is required' });
            return;
        }

        const updated = await productService.updateProduct(id, req.body);
        res.json({ success: true, data: updated });
    } catch (error) {
        if (error instanceof UnknownProductID) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('updateProduct error:', error);
            res.status(500).json({ success: false, error: "unexpected error" });
        }
    }
}

export async function deleteProduct(req: Request<{ id: string }>, res: Response) {
    try {
        const id = Number.parseInt(req.params.id as string);
        if (!id) {
            res.status(400).json({ success: false, error: 'valid product id is required' });
            return;
        }

        await productService.deleteProduct(id);
        res.status(200).json({ success: true, data: `product ${id} is removed` });
    } catch (error) {
        if (error instanceof UnknownProductID) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('deleteProduct error:', error);
            res.status(500).json({ success: false, error: "unexpected error" });
        }
    }
}
