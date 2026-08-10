import { pool } from '../config/db.js';
import type { Cart, CartItem, CartItemWithProduct } from '../models/cart.js';

  export class CartRepository {

      // Find a user's cart, or create one if it doesn't exist
      async findOrCreateCart(userId: number): Promise<Cart> {
          const { rows } = await pool.query(
              'SELECT * FROM carts WHERE user_id = $1',
              [userId]
          );

          if (rows[0]) {
              return rows[0];
          }

          const { rows: created } = await pool.query(
              'INSERT INTO carts (user_id) VALUES ($1) RETURNING *',
              [userId]
          );
          return created[0];
      }

      // Get all items in a user's cart, joined with product info
      async findCartWithItems(userId: number): Promise<CartItemWithProduct[]> {
          const { rows } = await pool.query(
              `SELECT
                  ci.id, ci.cart_id, ci.product_id, ci.quantity,
                  p.name        AS product_name,
                  p.price       AS product_price,
                  p.image_url   AS product_image_url,
                  p.stock       AS product_stock
              FROM cart_items ci
              JOIN products p ON ci.product_id = p.id
              WHERE ci.cart_id = (SELECT id FROM carts WHERE user_id = $1)`,
              [userId]
          );
          return rows;
      }

      // Add item (upsert: increment quantity if already in cart)
      async addItem(cartId: number, productId: number, quantity: number): Promise<CartItem> {
          const { rows } = await pool.query(
              `INSERT INTO cart_items (cart_id, product_id, quantity)
              VALUES ($1, $2, $3)
              ON CONFLICT (cart_id, product_id)
              DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = NOW()
              RETURNING *`,
              [cartId, productId, quantity]
          );
          return rows[0];
      }

      // Update the quantity of a specific cart item
      async updateQuantity(itemId: number, cartId: number, quantity: number): Promise<CartItem | null> {
          const { rows } = await pool.query(
              `UPDATE cart_items
              SET quantity = $3, updated_at = NOW()
              WHERE id = $1 AND cart_id = $2
              RETURNING *`,
              [itemId, cartId, quantity]
          );
          return rows[0] ?? null;
      }

      // Remove a single item from the cart (cart_id guards ownership)
      async removeItem(itemId: number, cartId: number): Promise<boolean> {
          const { rowCount } = await pool.query(
              'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2',
              [itemId, cartId]
          );
          return (rowCount ?? 0) > 0;
      }

      // Remove all items from a cart
      async clearCart(cartId: number): Promise<boolean> {
          const { rowCount } = await pool.query(
              'DELETE FROM cart_items WHERE cart_id = $1',
              [cartId]
          );
          return (rowCount ?? 0) > 0;
      }
  }

  export const cartRepository = new CartRepository();