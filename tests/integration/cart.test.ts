import { vi, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Create pg-mem database and set up the schema
// ---------------------------------------------------------------------------
const db = newDb();

// -- users table (migrations 001 + 002 combined) ---------------------------
db.public.none(`
    CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'customer',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`);

// -- categories table (migration 004) --------------------------------------
db.public.none(`
    CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        parent_id INT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`);

// -- products table (migrations 003 + 005 combined) ------------------------
db.public.none(`
    CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        description VARCHAR(1024) NOT NULL DEFAULT '',
        price FLOAT NOT NULL CHECK (price >= 0),
        stock INT NOT NULL CHECK (stock >= 0),
        image_url VARCHAR(1024) NOT NULL DEFAULT '',
        category VARCHAR(64) NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        category_id INT REFERENCES categories(id)
    );
`);

// -- carts + cart_items tables (migration 006) -----------------------------
db.public.none(`
    CREATE TABLE carts (
        id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id     INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`);

db.public.none(`
    CREATE TABLE cart_items (
        id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        cart_id     INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity    INT NOT NULL CHECK (quantity > 0),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (cart_id, product_id)
    );
`);

// Create a pg-pool-compatible adapter backed by pg-mem
const pg = db.adapters.createPg();
const mockPool = new pg.Pool();

// ---------------------------------------------------------------------------
// Mock the pool from src/config/db.js — replace it with pg-mem's pool.
// ---------------------------------------------------------------------------
vi.mock('../../src/config/db.js', () => ({
    pool: mockPool,
}));

// ---------------------------------------------------------------------------
// Import app AFTER the mock is registered
// ---------------------------------------------------------------------------
const { default: app } = await import('../../src/app.js');

// ---------------------------------------------------------------------------
// Test-global state
// ---------------------------------------------------------------------------
let customerAToken: string;
let customerBToken: string;
let adminToken: string;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
    request = supertest(app);

    // Seed customer A (userId: 1)
    const pwdA = await bcrypt.hash('passwordA', 10);
    await mockPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)`,
        ['Customer A', 'customerA@test.com', pwdA, 'customer'],
    );

    // Seed customer B (userId: 2) — for cross-user isolation tests
    const pwdB = await bcrypt.hash('passwordB', 10);
    await mockPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)`,
        ['Customer B', 'customerB@test.com', pwdB, 'customer'],
    );

    // Seed admin (userId: 3)
    const adminPwd = await bcrypt.hash('adminpass', 10);
    await mockPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)`,
        ['Admin', 'admin@test.com', adminPwd, 'admin'],
    );

    // Seed category
    await mockPool.query(`INSERT INTO categories (name) VALUES ($1)`, ['Electronics']);

    // Seed products
    await mockPool.query(
        `INSERT INTO products (name, description, price, stock, category_id)
        VALUES ($1, $2, $3, $4, $5)`,
        ['Laptop', 'A powerful laptop', 999.99, 10, 1],
    );
    await mockPool.query(
        `INSERT INTO products (name, description, price, stock, category_id)
        VALUES ($1, $2, $3, $4, $5)`,
        ['Mouse', 'Wireless mouse', 49.99, 50, 1],
    );
    await mockPool.query(
        `INSERT INTO products (name, description, price, stock, category_id)
        VALUES ($1, $2, $3, $4, $5)`,
        ['Sold Out Item', 'No stock', 5.00, 0, 1],
    );

    // Generate JWT tokens
    // userId in payload must match the DB id (SERIAL starts at 1)
    customerAToken = jwt.sign(
        { userId: '1', email: 'customerA@test.com', role: 'customer' },
        'access_secret_key',
        { expiresIn: '15m' },
    );

    customerBToken = jwt.sign(
        { userId: '2', email: 'customerB@test.com', role: 'customer' },
        'access_secret_key',
        { expiresIn: '15m' },
    );

    adminToken = jwt.sign(
        { userId: '3', email: 'admin@test.com', role: 'admin' },
        'access_secret_key',
        { expiresIn: '15m' },
    );
});

beforeEach(async () => {
    // Clean cart items and carts between tests
    await mockPool.query('DELETE FROM cart_items');
    await mockPool.query('DELETE FROM carts');
});

// ===========================================================================
// Tests
// ===========================================================================
describe('Cart API -- Integration', () => {
    // -----------------------------------------------------------------------
    // GET /cart
    // -----------------------------------------------------------------------
    describe('GET /cart', () => {
        it('returns 200 with empty cart for a user with no items', async () => {
            const res = await request
                .get('/cart')
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.items).toEqual([]);
            expect(res.body.data.total).toBe(0);
            expect(res.body.data.user_id).toBe(1);
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request.get('/cart');

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // POST /cart/items
    // -----------------------------------------------------------------------
    describe('POST /cart/items', () => {
        it('returns 201 and adds an item to the cart', async () => {
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 1, quantity: 2 });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.items).toHaveLength(1);
            expect(res.body.data.items[0]).toMatchObject({
                product_id: 1,
                product_name: 'Laptop',
                product_price: 999.99,
                quantity: 2,
                subtotal: 999.99 * 2,
            });
            expect(res.body.data.total).toBe(999.99 * 2);
        });

        it('upserts quantity when adding the same product again', async () => {
            // First add
            await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 1, quantity: 2 });

            // Second add — same product
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 1, quantity: 3 });

            expect(res.status).toBe(201);
            expect(res.body.data.items).toHaveLength(1);
            expect(res.body.data.items[0].quantity).toBe(5);  // 2 + 3
            expect(res.body.data.items[0].subtotal).toBe(999.99 * 5);
        });

        it('returns 201 with multiple different products', async () => {
            await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 1, quantity: 2 });

            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 2, quantity: 1 });

            expect(res.status).toBe(201);
            expect(res.body.data.items).toHaveLength(2);
            expect(res.body.data.total).toBe(999.99 * 2 + 49.99 * 1);
        });

        it('returns 404 when product does not exist', async () => {
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 9999, quantity: 1 });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                success: false,
                error: 'unknown product ID',
            });
        });

        it('returns 400 when product is out of stock', async () => {
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 3, quantity: 1 });  // Sold Out Item (stock = 0)

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                success: false,
                error: 'product is out of stock',
            });
        });

        it('returns 400 when required fields are missing', async () => {
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({
                success: false,
                error: 'request validation failed',
            });
            expect(res.body.details).toEqual(expect.arrayContaining([
                expect.objectContaining({ path: 'product_id' }),
                expect.objectContaining({ path: 'quantity' }),
            ]));
        });

        it.each([
            { product_id: '1', quantity: 1 },
            { product_id: 1.5, quantity: 1 },
            { product_id: 1, quantity: 0 },
            { product_id: 1, quantity: 100 },
            { product_id: 1, quantity: 1, unexpected: true },
        ])('returns 400 for invalid body: %o', async body => {
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('request validation failed');
            expect(res.body.details).toEqual(expect.any(Array));
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request
                .post('/cart/items')
                .send({ product_id: 1, quantity: 1 });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // PATCH /cart/items/:id
    // -----------------------------------------------------------------------
    describe('PATCH /cart/items/:id', () => {
        // Helper: add item via API and return its item id
        async function seedCartItem(token: string, productId: number, qty: number): Promise<number> {
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${token}`)
                .send({ product_id: productId, quantity: qty });
            return res.body.data.items[0].id;
        }

        it('returns 200 with updated quantity', async () => {
            const itemId = await seedCartItem(customerAToken, 1, 1);

            const res = await request
                .patch(`/cart/items/${itemId}`)
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ quantity: 5 });

            expect(res.status).toBe(200);
            expect(res.body.data.items[0].quantity).toBe(5);
            expect(res.body.data.items[0].subtotal).toBe(999.99 * 5);
        });

        it('returns 404 when item does not exist', async () => {
            const res = await request
                .patch('/cart/items/9999')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ quantity: 5 });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                success: false,
                error: 'cart item not found',
            });
        });

        it('returns 400 when quantity is missing', async () => {
            const itemId = await seedCartItem(customerAToken, 1, 1);

            const res = await request
                .patch(`/cart/items/${itemId}`)
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('request validation failed');
            expect(res.body.details).toEqual([
                expect.objectContaining({ path: 'quantity' }),
            ]);
        });

        it.each([0, -1, 1.5, 100])('returns 400 when quantity is %s', async quantity => {
            const itemId = await seedCartItem(customerAToken, 1, 1);

            const res = await request
                .patch(`/cart/items/${itemId}`)
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ quantity });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('request validation failed');
        });

        it('returns 400 when item id is invalid', async () => {
            const res = await request
                .patch('/cart/items/not-a-number')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ quantity: 1 });

            expect(res.status).toBe(400);
            expect(res.body.details).toEqual([
                expect.objectContaining({ path: 'id' }),
            ]);
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request
                .patch('/cart/items/1')
                .send({ quantity: 5 });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // DELETE /cart/items/:id
    // -----------------------------------------------------------------------
    describe('DELETE /cart/items/:id', () => {
        async function seedCartItem(token: string, productId: number, qty: number): Promise<number> {
            const res = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${token}`)
                .send({ product_id: productId, quantity: qty });
            return res.body.data.items[0].id;
        }

        it('returns 200 and removes the item', async () => {
            const itemId = await seedCartItem(customerAToken, 1, 1);

            const res = await request
                .delete(`/cart/items/${itemId}`)
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.items).toHaveLength(0);
            expect(res.body.data.total).toBe(0);
        });

        it('returns 404 when item does not exist', async () => {
            const res = await request
                .delete('/cart/items/9999')
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                success: false,
                error: 'cart item not found',
            });
        });

        it('returns 400 when item id is invalid', async () => {
            const res = await request
                .delete('/cart/items/0')
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('request validation failed');
            expect(res.body.details).toEqual([
                expect.objectContaining({ path: 'id' }),
            ]);
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request.delete('/cart/items/1');

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // DELETE /cart (clear)
    // -----------------------------------------------------------------------
    describe('DELETE /cart (clear)', () => {
        it('returns 200 and clears all items', async () => {
            // Add two items first
            await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 1, quantity: 2 });
            await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerAToken}`)
                .send({ product_id: 2, quantity: 1 });

            const res = await request
                .delete('/cart')
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                data: { message: 'cart cleared' },
            });

            // Verify cart is empty
            const getRes = await request
                .get('/cart')
                .set('Authorization', `Bearer ${customerAToken}`);
            expect(getRes.body.data.items).toHaveLength(0);
            expect(getRes.body.data.total).toBe(0);
        });

        it('returns 200 even when cart is already empty', async () => {
            const res = await request
                .delete('/cart')
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                data: { message: 'cart cleared' },
            });
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request.delete('/cart');

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // Cross-user isolation
    // -----------------------------------------------------------------------
    describe('cross-user isolation', () => {
        it("customer A cannot see customer B's cart", async () => {
            // Customer B adds an item
            await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerBToken}`)
                .send({ product_id: 1, quantity: 3 });

            // Customer A checks their cart — should be empty
            const res = await request
                .get('/cart')
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.items).toHaveLength(0);
        });

        it("customer A cannot delete customer B's item", async () => {
            // Customer B adds an item
            const addRes = await request
                .post('/cart/items')
                .set('Authorization', `Bearer ${customerBToken}`)
                .send({ product_id: 1, quantity: 1 });
            const bItemId = addRes.body.data.items[0].id;

            // Customer A tries to delete B's item → 404 (not found / not yours)
            const res = await request
                .delete(`/cart/items/${bItemId}`)
                .set('Authorization', `Bearer ${customerAToken}`);

            expect(res.status).toBe(404);
        });
    });
});
