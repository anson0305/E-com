import { newDb } from 'pg-mem';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { genJwtAccessToken } from '../../src/services/JWT.js';

// ---------------------------------------------------------------------------
// Setup in-memory Postgres via pg-mem
// ---------------------------------------------------------------------------
const db = newDb();

// Users table — needed so the app's user-related code can reference it, and so
// we can seed an admin user for authenticated tests.
db.public.none(`
    CREATE TABLE users (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'customer',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

// Categories table (matches migrations/004_categories.sql)
db.public.none(`
    CREATE TABLE categories (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        parent_id INT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

// Seed an admin user so we can generate valid admin tokens for auth tests.
const adminUser = db.public.one(`
    INSERT INTO users (name, email, password, role)
    VALUES ('Admin', 'admin@test.com', 'hashed_password', 'admin')
    RETURNING *
`);

// Build a pg-mem Pool to act as the replacement for the real pg Pool.
const { Pool } = db.adapters.createPg();
const testPool = new Pool();

// ---------------------------------------------------------------------------
// Mock the database pool BEFORE importing app.
// vitest hoists the vi.mock registration; the factory runs lazily when
// src/config/db.js is first imported (triggered by the dynamic import below).
// ---------------------------------------------------------------------------
vi.mock('../../src/config/db.js', () => ({
    pool: testPool,
}));

const { default: app } = await import('../../src/app.js');

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
function adminToken(): string {
    return genJwtAccessToken({
        userId: String(adminUser.id as number),
        email: adminUser.email as string,
        role: 'admin',
    });
}

function customerToken(): string {
    return genJwtAccessToken({
        userId: '999',
        email: 'customer@test.com',
        role: 'customer',
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Category Routes Integration', () => {
    let createdCategoryId: number;

    // 1. GET /categories → 200 with array (empty initially)
    // -----------------------------------------------------------------------
    it('GET /categories → 200 with empty array', async () => {
        const res = await request(app).get('/categories');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual([]);
    });

    // 4. POST /categories as admin → 201 (creates the category used by test 2)
    // -----------------------------------------------------------------------
    it('POST /categories as admin → 201', async () => {
        const res = await request(app)
            .post('/categories')
            .set('Authorization', `Bearer ${adminToken()}`)
            .send({ name: 'Electronics' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data.name).toBe('Electronics');
        expect(res.body.data.parent_id).toBeNull();

        createdCategoryId = res.body.data.id;
    });

    // 2. GET /categories/:id → 200 with category (after inserting one)
    // -----------------------------------------------------------------------
    it('GET /categories/:id → 200 with category', async () => {
        const res = await request(app).get(`/categories/${createdCategoryId}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(createdCategoryId);
        expect(res.body.data.name).toBe('Electronics');
    });

    // 3. GET /categories/999 → 404
    // -----------------------------------------------------------------------
    it('GET /categories/999 → 404', async () => {
        const res = await request(app).get('/categories/999');

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBeDefined();
    });

    // 5. POST /categories with duplicate name → 409
    // -----------------------------------------------------------------------
    it('POST /categories with duplicate name → 409', async () => {
        const res = await request(app)
            .post('/categories')
            .set('Authorization', `Bearer ${adminToken()}`)
            .send({ name: 'Electronics' });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
    });

    // 6. POST /categories without auth → 401
    // -----------------------------------------------------------------------
    it('POST /categories without auth → 401', async () => {
        const res = await request(app)
            .post('/categories')
            .send({ name: 'Books' });

        expect(res.status).toBe(401);
    });

    // 7. POST /categories as customer → 403
    // -----------------------------------------------------------------------
    it('POST /categories as customer → 403', async () => {
        const res = await request(app)
            .post('/categories')
            .set('Authorization', `Bearer ${customerToken()}`)
            .send({ name: 'Books' });

        expect(res.status).toBe(403);
    });
});
