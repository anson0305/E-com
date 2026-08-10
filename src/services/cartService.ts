import { cartRepository } from '../repositories/cartRepository.js';
import type { AddToCartInput, CartItemResponse, CartResponse } from '../models/cart.js';
import { productService, UnknownProductID } from './productService.js';

export class CartItemNotFoundError extends Error {
    constructor() {
        super('cart item not found');
        this.name = 'CartItemNotFoundError';
    }
}

export class ProductOutOfStockError extends Error {
    constructor() {
        super('product is out of stock');
        this.name = 'ProductOutOfStockError';
    }
}
export class CartService {
    constructor(
        private cartRepo = cartRepository,
        private productSvc = productService,
    ) {}

    // Build a full CartResponse from a userId
    private async buildCartResponse(userId: number): Promise<CartResponse> {
        const cart = await this.cartRepo.findOrCreateCart(userId);
        const items = await this.cartRepo.findCartWithItems(userId);

        const itemResponses: CartItemResponse[] = items.map(item => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            product_price: item.product_price,
            product_image_url: item.product_image_url,
            quantity: item.quantity,
            subtotal: item.product_price * item.quantity,
        }));

        const total = itemResponses.reduce((sum, i) => sum + i.subtotal, 0);

        return {
            id: cart.id,
            user_id: cart.user_id,
            items: itemResponses,
            total,
            created_at: cart.created_at,
            updated_at: cart.updated_at,
        };
    }

    async getCart(userId: number): Promise<CartResponse> {
        return this.buildCartResponse(userId);
    }

    async addItem(userId: number, input: AddToCartInput): Promise<CartResponse> {
        // 1. Validate product exists
        const product = await this.productSvc.findById(input.product_id);

        // 2. Check stock
        if (product.stock <= 0) {
            throw new ProductOutOfStockError();
        }

        // 3. Find or create cart, then add item (upsert)
        const cart = await this.cartRepo.findOrCreateCart(userId);
        await this.cartRepo.addItem(cart.id, input.product_id, input.quantity);

        // 4. Return full cart
        return this.buildCartResponse(userId);
    }

    async updateQuantity(userId: number, itemId: number, quantity: number): Promise<CartResponse> {
        if (quantity <= 0) {
            throw new Error('quantity must be greater than 0');
        }

        const cart = await this.cartRepo.findOrCreateCart(userId);
        const updated = await this.cartRepo.updateQuantity(itemId, cart.id, quantity);

        if (!updated) {
            throw new CartItemNotFoundError();
        }

        return this.buildCartResponse(userId);
    }

    async removeItem(userId: number, itemId: number): Promise<CartResponse> {
        const cart = await this.cartRepo.findOrCreateCart(userId);
        const removed = await this.cartRepo.removeItem(itemId, cart.id);

        if (!removed) {
            throw new CartItemNotFoundError();
        }

        return this.buildCartResponse(userId);
    }

    async clearCart(userId: number): Promise<{ message: string }> {
        const cart = await this.cartRepo.findOrCreateCart(userId);
        await this.cartRepo.clearCart(cart.id);
        return { message: 'cart cleared' };
    }
}

export const cartService = new CartService();