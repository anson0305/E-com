import type { Request, Response } from 'express';
import {
    cartService,
    CartItemNotFoundError,
    ProductOutOfStockError,
} from '../services/cartService.js';
import { UnknownProductID } from '../services/productService.js';

export async function getCart(req: Request, res: Response) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const cart = await cartService.getCart(userId);
        res.json({ success: true, data: cart });
    } catch (error) {
        console.error('getCart error:', error);
        res.status(500).json({ success: false, error: 'unexpected error' });
    }
}

export async function addItem(req: Request, res: Response) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const { product_id, quantity } = req.body;

        if (!product_id || quantity === undefined) {
            res.status(400).json({
                success: false,
                error: 'product_id and quantity are required',
            });
            return;
        }

        const cart = await cartService.addItem(userId, {
            product_id,
            quantity: quantity ?? 1,
        });
        res.status(201).json({ success: true, data: cart });
    } catch (error) {
        if (error instanceof UnknownProductID) {
            res.status(404).json({ success: false, error: error.message });
        } else if (error instanceof ProductOutOfStockError) {
            res.status(400).json({ success: false, error: error.message });
        } else {
            console.error('addItem error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}

export async function updateQuantity(req: Request, res: Response) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const itemId = Number(req.params.id);
        const { quantity } = req.body;

        if (!itemId || quantity === undefined) {
            res.status(400).json({
                success: false,
                error: 'valid item id and quantity are required',
            });
            return;
        }

        const cart = await cartService.updateQuantity(userId, itemId, quantity);
        res.json({ success: true, data: cart });
    } catch (error) {
        if (error instanceof CartItemNotFoundError) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('updateQuantity error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}

export async function removeItem(req: Request, res: Response) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const itemId = Number(req.params.id);

        if (!itemId) {
            res.status(400).json({
                success: false,
                error: 'valid item id is required',
            });
            return;
        }

        const cart = await cartService.removeItem(userId, itemId);
        res.json({ success: true, data: cart });
    } catch (error) {
        if (error instanceof CartItemNotFoundError) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('removeItem error:', error);
            res.status(500).json({ success: false, error: 'unexpected error' });
        }
    }
}

export async function clearCart(req: Request, res: Response) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const result = await cartService.clearCart(userId);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('clearCart error:', error);
        res.status(500).json({ success: false, error: 'unexpected error' });
    }
}