import type { Request, Response } from 'express';
import {
    cartService,
    CartItemNotFoundError,
    ProductOutOfStockError,
} from '../services/cartService.js';
import { UnknownProductID } from '../services/productService.js';
import type { AddCartItemBody, UpdateCartItemBody } from '../schemas/cartSchemas.js';

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

export async function addItem(req: Request<{}, unknown, AddCartItemBody>, res: Response) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const { product_id, quantity } = req.body;

        const cart = await cartService.addItem(userId, {
            product_id,
            quantity,
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

export async function updateQuantity(
    req: Request<{ id: string }, unknown, UpdateCartItemBody>,
    res: Response,
) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const itemId = Number(req.params.id);
        const { quantity } = req.body;

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

export async function removeItem(req: Request<{ id: string }>, res: Response) {
    try {
        const userId = Number(req.jwtPayload!.userId);
        const itemId = Number(req.params.id);

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
