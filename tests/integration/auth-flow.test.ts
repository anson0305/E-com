import { newDb } from 'pg-mem';
import { vi, describe, it, expect } from 'vitest';
import supertest from 'supertest';

// ── In-memory Postgres (pg-mem) ───────────────────────────────────────
const db = newDb();

// ── Run all migrations as the final merged schema ─────────────────────
// 001: users_initial + 002: fix_users_constraints
db.public.none(`
    CREATE TABLE users (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'customer',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

// 003: product_initial + 005: fix_product_category_fk
// NOTE: category column is given a DEFAULT so INSERTs that only set
//       category_id (the current code path) will not fail.
db.public.none(`
    CREATE TABLE products (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        description VARCHAR(1024) NOT NULL DEFAULT '',
        price FLOAT NOT NULL CHECK (price >= 0),
        stock INT NOT NULL CHECK (stock >= 0),
        image_url VARCHAR(1024) NOT NULL DEFAULT '',
        category VARCHAR(64) NOT NULL DEFAULT '',
        category_id INT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

// 004: categories
db.public.none(`
    CREATE TABLE categories (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        parent_id INT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

// Add FK from products.category_id → categories(id) (from 005)
db.public.none(`
    ALTER TABLE products
    ADD CONSTRAINT fk_product_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
`);

// ── Create pg adapter and mock the pool ──────────────────────────────
const { Pool: MemPool } = db.adapters.createPg();
const memPool = new MemPool();

vi.mock('../../src/config/db.js', () => ({
    pool: {
        query: (text: string, params?: unknown[]) =>
            memPool.query(text, params) as ReturnType<typeof memPool.query>,
    },
}));

// Import app AFTER mocking the database (vi.mock is hoisted)
import app from '../../src/app.js';
const request = supertest(app);

// ── Tests ────────────────────────────────────────────────────────────
describe('Auth integration', () => {
    it('Full admin workflow', async () => {
        // ── Step 1: Register a new admin user ─────────────────────────
        const registerRes = await request
            .post('/users/register')
            .send({ email: 'admin@test.com', userName: 'Admin', password: 'admin123' });

        expect(registerRes.status).toBe(201);
        expect(registerRes.body.success).toBe(true);
        expect(registerRes.body.data.user).toMatchObject({
            name: 'Admin',
            email: 'admin@test.com',
            role: 'customer',
        });
        expect(typeof registerRes.body.data.access_token).toBe('string');

        // ── Step 2: Directly promote to admin via SQL ─────────────────
        db.public.none(
            "UPDATE users SET role = 'admin' WHERE email = 'admin@test.com'",
        );

        // ── Step 3: Login as admin, extract access_token ──────────────
        const loginRes = await request
            .post('/users/login')
            .send({ email: 'admin@test.com', password: 'admin123' });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.success).toBe(true);
        expect(loginRes.body.data.user.role).toBe('admin');
        const adminToken: string = loginRes.body.data.access_token;
        expect(typeof adminToken).toBe('string');

        // ── Step 4: Create "Electronics" category ────────────────────
        const cat1Res = await request
            .post('/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Electronics' });

        expect(cat1Res.status).toBe(201);
        expect(cat1Res.body.success).toBe(true);
        expect(cat1Res.body.data.name).toBe('Electronics');
        const electronicsId: number = cat1Res.body.data.id;
        expect(typeof electronicsId).toBe('number');

        // ── Step 5: Create sub-category "Phones" under Electronics ───
        const cat2Res = await request
            .post('/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Phones', parent_id: electronicsId });

        expect(cat2Res.status).toBe(201);
        expect(cat2Res.body.success).toBe(true);
        expect(cat2Res.body.data.name).toBe('Phones');
        expect(cat2Res.body.data.parent_id).toBe(electronicsId);
        const phonesId: number = cat2Res.body.data.id;

        // ── Step 6: Create a product in "Phones" category ────────────
        const createProdRes = await request
            .post('/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'iPhone 20',
                description: 'The latest phone',
                price: 999.99,
                stock: 50,
                category_id: phonesId,
            });

        expect(createProdRes.status).toBe(201);
        expect(createProdRes.body.success).toBe(true);
        expect(createProdRes.body.data.name).toBe('iPhone 20');
        expect(createProdRes.body.data.price).toBe(999.99);
        const productId: number = createProdRes.body.data.id;

        // ── Step 7: Search product by category "Phones" ──────────────
        const searchRes = await request
            .get('/products/search')
            .query({ category: 'Phones' });

        expect(searchRes.status).toBe(200);
        expect(searchRes.body.success).toBe(true);
        expect(searchRes.body.data).toHaveLength(1);
        expect(searchRes.body.data[0].name).toBe('iPhone 20');

        // ── Step 8: Update the product price ─────────────────────────
        const updateRes = await request
            .put(`/products/${productId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ price: 799.99 });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.success).toBe(true);
        expect(updateRes.body.data.price).toBe(799.99);

        // ── Step 9: Delete the product ───────────────────────────────
        const deleteRes = await request
            .delete(`/products/${productId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.success).toBe(true);

        // ── Step 10: Verify product is gone ──────────────────────────
        const verifyRes = await request
            .get('/products/search')
            .query({ id: productId });

        expect(verifyRes.status).toBe(404);
        expect(verifyRes.body.success).toBe(false);

        // ── Step 11: Customer cannot perform admin-only operations ────
        // Register a customer
        const custRegRes = await request
            .post('/users/register')
            .send({ email: 'customer@test.com', userName: 'Customer', password: 'cust123' });

        expect(custRegRes.status).toBe(201);
        const custToken: string = custRegRes.body.data.access_token;

        // Customer tries to create a product → 403
        const deniedRes = await request
            .post('/products')
            .set('Authorization', `Bearer ${custToken}`)
            .send({
                name: 'Evil Product',
                price: 1,
                stock: 1,
                category_id: phonesId,
            });

        expect(deniedRes.status).toBe(403);
        expect(deniedRes.body.error).toBe('Forbidden: insufficient permissions');
    });
});
