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
// NOTE: the original "category" column from 003 stays in the real DB but the
// repository no longer uses it — giving it DEFAULT '' so INSERT without the
// column doesn't fail.
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

// Create a pg-pool-compatible adapter backed by pg-mem
const pg = db.adapters.createPg();
const mockPool = new pg.Pool();

// ---------------------------------------------------------------------------
// Mock the pool from src/config/db.js — replace it with pg-mem's pool.
// vi.mock is hoisted by vitest but its factory is only called lazily when
// the module is first imported. Since app is imported after all top-level
// code, mockPool is guaranteed to be initialized by then.
// ---------------------------------------------------------------------------
vi.mock('../../src/config/db.js', () => ({
    pool: mockPool,
}));

// ---------------------------------------------------------------------------
// Import app AFTER the mock is registered (top-level dynamic import)
// ---------------------------------------------------------------------------
const { default: app } = await import('../../src/app.js');

// ---------------------------------------------------------------------------
// Test-global state
// ---------------------------------------------------------------------------
let adminToken: string;
let customerToken: string;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
    request = supertest(app);

    // Seed admin user
    const adminPwdHash = await bcrypt.hash('adminpass', 10);
    await mockPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)`,
        ['Admin User', 'admin@test.com', adminPwdHash, 'admin'],
    );

    // Seed customer user
    const customerPwdHash = await bcrypt.hash('customerpass', 10);
    await mockPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)`,
        ['Customer User', 'customer@test.com', customerPwdHash, 'customer'],
    );

    // Seed parent category
    await mockPool.query(
        `INSERT INTO categories (name) VALUES ($1)`,
        ['Electronics'],
    );
    // Seed child category (so searching "Electronics" finds products via child)
    await mockPool.query(
        `INSERT INTO categories (name, parent_id) VALUES ($1, $2)`,
        ['Phones', 1],
    );
    // Another standalone category
    await mockPool.query(
        `INSERT INTO categories (name) VALUES ($1)`,
        ['Books'],
    );

    // Generate JWT tokens (JWT_ACCESS_SECRET falls back to 'access_secret_key')
    adminToken = jwt.sign(
        { userId: '1', email: 'admin@test.com', role: 'admin' },
        'access_secret_key',
        { expiresIn: '15m' },
    );

    customerToken = jwt.sign(
        { userId: '2', email: 'customer@test.com', role: 'customer' },
        'access_secret_key',
        { expiresIn: '15m' },
    );
});

beforeEach(async () => {
    // Clean products table between tests so each test starts fresh
    await mockPool.query('DELETE FROM products');
});

// ---------------------------------------------------------------------------
// Helper: create a product via the API as admin, return the product id
// ---------------------------------------------------------------------------
async function seedProduct(overrides: Record<string, unknown> = {}): Promise<number> {
    const res = await request
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            name: 'Test Widget',
            price: 9.99,
            stock: 100,
            category_id: 2, // "Phones" (child of Electronics)
            description: 'A test widget',
            ...overrides,
        });

    if (res.status !== 201) {
        throw new Error(`Failed to seed product: ${res.status} ${JSON.stringify(res.body)}`);
    }

    return res.body.data.id as number;
}

// ===========================================================================
// Tests
// ===========================================================================
describe('Products API -- Integration', () => {
    // -----------------------------------------------------------------------
    // GET /products
    // -----------------------------------------------------------------------
    describe('GET /products', () => {
        it('returns 200 with empty array when no products exist', async () => {
            const res = await request.get('/products');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                data: [],
                pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
            });
        });

        it('returns 200 with products when seeded', async () => {
            // Create two products
            await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Alpha', price: 10, stock: 5, category_id: 2, description: 'First' });

            await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Beta', price: 20, stock: 3, category_id: 1, description: 'Second' });

            const res = await request.get('/products').query({ sort: 'name', order: 'asc' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
            expect(res.body.data[0]).toMatchObject({ name: 'Alpha', price: 10, stock: 5 });
            expect(res.body.data[1]).toMatchObject({ name: 'Beta', price: 20, stock: 3 });
        });

        it('paginates, sorts, and filters products in the database query', async () => {
            await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Alpha', price: 10, stock: 5, category_id: 2 });
            await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Beta', price: 20, stock: 3, category_id: 2 });
            await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Book', price: 5, stock: 8, category_id: 3 });

            const page = await request.get('/products').query({
                category_id: 2,
                sort: 'price',
                order: 'desc',
                page: 2,
                limit: 1,
            });

            expect(page.status).toBe(200);
            expect(page.body.data).toEqual([
                expect.objectContaining({ name: 'Alpha', price: 10 }),
            ]);
            expect(page.body.pagination).toEqual({ page: 2, limit: 1, total: 2, total_pages: 2 });

            const byName = await request.get('/products').query({ name: 'alpha' });
            expect(byName.status).toBe(200);
            expect(byName.body.data).toEqual([
                expect.objectContaining({ name: 'Alpha' }),
            ]);
        });

        it.each([
            { page: 0 },
            { limit: 101 },
            { sort: 'unknown' },
            { category_id: 'not-a-number' },
        ])('rejects invalid list query: %o', async query => {
            const res = await request.get('/products').query(query);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('request validation failed');
        });
    });

    // -----------------------------------------------------------------------
    // GET /products/search?id=
    // -----------------------------------------------------------------------
    describe('GET /products/search?id=', () => {
        it('returns 200 with product when found by id', async () => {
            const id = await seedProduct({ name: 'Widget' });

            const res = await request.get('/products/search').query({ id: String(id) });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                id,
                name: 'Widget',
                price: 9.99,
                stock: 100,
                category_id: 2,
            });
        });

        it('returns 404 when product id does not exist', async () => {
            const res = await request.get('/products/search').query({ id: '999' });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                success: false,
                error: 'unknown product ID',
            });
        });
    });

    // -----------------------------------------------------------------------
    // GET /products/search?category=
    // -----------------------------------------------------------------------
    describe('GET /products/search?category=', () => {
        it('returns 200 with products under the category hierarchy', async () => {
            // Product under "Phones" (child of "Electronics").
            // Searching "Electronics" finds products under child categories.
            const id = await seedProduct({ name: 'Smartphone', category_id: 2 });

            const res = await request.get('/products/search').query({ category: 'Electronics' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0]).toMatchObject({
                id,
                name: 'Smartphone',
                category_id: 2,
            });
        });

        it('returns 404 when category does not exist', async () => {
            const res = await request.get('/products/search').query({ category: 'NonExistent' });

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // GET /products/search?name=
    // -----------------------------------------------------------------------
    describe('GET /products/search?name=', () => {
        it('returns 200 with product when found by exact name', async () => {
            const id = await seedProduct({ name: 'Widget' });

            const res = await request.get('/products/search').query({ name: 'Widget' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                id,
                name: 'Widget',
            });
        });

        it('returns 404 when name does not match any product', async () => {
            const res = await request.get('/products/search').query({ name: 'NonExistent' });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                success: false,
                error: 'no such product',
            });
        });
    });

    // -----------------------------------------------------------------------
    // GET /products/search (no query params)
    // -----------------------------------------------------------------------
    describe('GET /products/search without query params', () => {
        it('returns 400 when no query parameters are provided', async () => {
            const res = await request.get('/products/search');

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({
                success: false,
                error: 'request validation failed',
            });
            expect(res.body.details).toEqual([
                expect.objectContaining({ path: '' }),
            ]);
        });

        it.each([
            { id: 'not-a-number' },
            { id: '1', name: 'Widget' },
        ])('returns 400 for invalid search query: %o', async query => {
            const res = await request.get('/products/search').query(query);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('request validation failed');
        });
    });

    // -----------------------------------------------------------------------
    // POST /products (create)
    // -----------------------------------------------------------------------
    describe('POST /products', () => {
        it('returns 201 when admin creates a product', async () => {
            const res = await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'New Product',
                    description: 'Fresh item',
                    price: 29.99,
                    stock: 50,
                    image_url: '/images/new.png',
                    category_id: 2,
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                name: 'New Product',
                description: 'Fresh item',
                price: 29.99,
                stock: 50,
                category_id: 2,
            });
            expect(res.body.data.id).toBeGreaterThan(0);
        });

        it('returns 400 when required fields are missing', async () => {
            const res = await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'No name, price, stock, or category_id' });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({
                success: false,
                error: 'request validation failed',
            });
            expect(res.body.details).toEqual(expect.arrayContaining([
                expect.objectContaining({ path: 'name' }),
                expect.objectContaining({ path: 'price' }),
                expect.objectContaining({ path: 'stock' }),
                expect.objectContaining({ path: 'category_id' }),
            ]));
        });

        it.each([
            { name: '', price: 10, stock: 1, category_id: 2 },
            { name: 'Invalid Price', price: -1, stock: 1, category_id: 2 },
            { name: 'Invalid Stock', price: 10, stock: 1.5, category_id: 2 },
            { name: 'Extra Field', price: 10, stock: 1, category_id: 2, role: 'admin' },
        ])('returns 400 for invalid product body: %o', async body => {
            const res = await request
                .post('/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('request validation failed');
        });

        it('returns 403 when customer tries to create a product', async () => {
            const res = await request
                .post('/products')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({
                    name: 'Forbidden Product',
                    price: 10,
                    stock: 10,
                    category_id: 2,
                });

            expect(res.status).toBe(403);
            expect(res.body).toHaveProperty('error', 'Forbidden: insufficient permissions');
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request
                .post('/products')
                .send({
                    name: 'Unauthorized Product',
                    price: 10,
                    stock: 10,
                    category_id: 2,
                });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // PUT /products/:id (update)
    // -----------------------------------------------------------------------
    describe('PUT /products/:id', () => {
        it('returns 200 when admin updates a product', async () => {
            const id = await seedProduct({ name: 'Old Name', price: 5 });

            const res = await request
                .put(`/products/${id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Updated Name', price: 15 });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                id,
                name: 'Updated Name',
                price: 15,
            });
        });

        it('returns 404 when updating a non-existent product', async () => {
            const res = await request
                .put('/products/999')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Ghost' });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                success: false,
                error: 'unknown product ID',
            });
        });

        it('returns 400 when id is not a valid number', async () => {
            const res = await request
                .put('/products/abc')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Nope' });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({
                success: false,
                error: 'request validation failed',
            });
            expect(res.body.details).toEqual([
                expect.objectContaining({ path: 'id' }),
            ]);
        });

        it('returns 400 when update body is empty or invalid', async () => {
            const id = await seedProduct();

            const empty = await request
                .put(`/products/${id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});
            expect(empty.status).toBe(400);

            const invalid = await request
                .put(`/products/${id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ stock: -1 });
            expect(invalid.status).toBe(400);
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request
                .put('/products/1')
                .send({ name: 'Unauthorized Update' });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // DELETE /products/:id
    // -----------------------------------------------------------------------
    describe('DELETE /products/:id', () => {
        it('returns 200 when admin deletes a product', async () => {
            const id = await seedProduct({ name: 'To Be Deleted' });

            const res = await request
                .delete(`/products/${id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                data: `product ${id} is removed`,
            });

            // Verify the product is gone
            const searchRes = await request
                .get('/products/search')
                .query({ id: String(id) });
            expect(searchRes.status).toBe(404);
        });

        it('returns 404 when deleting a non-existent product', async () => {
            const res = await request
                .delete('/products/999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                success: false,
                error: 'unknown product ID',
            });
        });

        it('returns 400 when id is not a valid number', async () => {
            const res = await request
                .delete('/products/abc')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({
                success: false,
                error: 'request validation failed',
            });
            expect(res.body.details).toEqual([
                expect.objectContaining({ path: 'id' }),
            ]);
        });

        it('returns 401 when no auth token is provided', async () => {
            const res = await request.delete('/products/1');

            expect(res.status).toBe(401);
        });
    });
});
