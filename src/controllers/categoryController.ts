import type { Request, Response } from 'express';
import { categoryService, CategoryNotFoundError, CategoryParentError } from '../services/categoryService.js';
import type { CreateCategoryBody } from '../schemas/categorySchemas.js';

export async function listCategories(_req: Request, res: Response) {
    try {
        const categories = await categoryService.listAll();
        res.json({ success: true, data: categories });
    } catch (error) {
        console.error('listCategories error:', error);
        res.status(500).json({ success: false, error: 'unexpected error' });
    }
}

export async function getCategory(req: Request<{ id: string }>, res: Response) {
    try {
        const id = Number.parseInt(req.params.id as string);
        if (!id) {
            res.status(400).json({ success: false, error: 'valid category id is required' });
            return;
        }

        const category = await categoryService.getById(id);
        res.json({ success: true, data: category });
    } catch (error) {
        if (error instanceof CategoryNotFoundError) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('getCategory error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}

export async function createCategory(req: Request<{}, unknown, CreateCategoryBody>, res: Response) {
    try {
        const { name, parent_id } = req.body;

        if (!name) {
            res.status(400).json({ success: false, error: 'name is required' });
            return;
        }

        const category = await categoryService.create(name, parent_id);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        if (error instanceof CategoryParentError) {
            res.status(400).json({ success: false, error: error.message });
        } else if (error instanceof Error && error.message.startsWith('Category')) {
            res.status(409).json({ success: false, error: error.message });
        } else {
            console.error('createCategory error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}
