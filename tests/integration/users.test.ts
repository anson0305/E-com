import { newDb } from 'pg-mem';
import { vi, describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { genJwtAccessToken, hashPwd } from '../../src/services/JWT.js';
import type { UserPayload } from '../../src/services/JWT.js';

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
    );
`);

// 003: product_initial + 005: fix_product_category_fk
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
    );
`);

// 004: categories
db.public.none(`
    CREATE TABLE categories (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        parent_id INT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`);

// Add FK from products.category_id → categories(id) (from 005)
db.public.none(`
    ALTER TABLE products
    ADD CONSTRAINT fk_product_category
    FOREIGN KEY (category_id) REFERENCES categories(id);
`);

// ── Create pg adapter and mock the pool ───────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────

/** Shortcut for setting the Authorization header */
function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
}

/**
 * Seed an admin user directly via pg-mem and return a valid JWT.
 * Each admin test gets its own admin so tests stay independent.
 */
async function seedAdmin(name: string, email: string): Promise<{ userId: number; token: string }> {
    const hashed = await hashPwd('adminpass');
    const { rows } = await memPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'admin') RETURNING *`,
        [name, email, hashed],
    );
    const adminId = rows[0].id as number;
    const payload: UserPayload = {
        userId: adminId.toString(),
        email,
        role: 'admin',
    };
    const token = genJwtAccessToken(payload);
    return { userId: adminId, token };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Users API — Integration', () => {
    it('sets security headers and rejects JSON bodies over 100kb', async () => {
        const headers = await request.get('/users/profile');
        expect(headers.headers['x-content-type-options']).toBe('nosniff');

        const tooLarge = await request
            .post('/users/login')
            .send({ email: 'large@example.com', password: 'a'.repeat(101 * 1024) });

        expect(tooLarge.status).toBe(413);
        expect(tooLarge.body).toEqual({ success: false, error: 'Request body is too large' });
    });

    // 1 ────────────────────────────────────────────────────────────────
    it('POST /users/register → 201 with user data and tokens', async () => {
        const res = await request
            .post('/users/register')
            .send({ email: 'test@example.com', userName: 'TestUser', password: 'secure123' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user).toMatchObject({
            email: 'test@example.com',
            name: 'TestUser',
            role: 'customer',
        });
        expect(res.body.data.user.id).toBeDefined();
        expect(res.body.data.access_token).toBeDefined();
        expect(res.body.data.refresh_token).toBeDefined();
    });

    // 2 ────────────────────────────────────────────────────────────────
    it('POST /users/register with duplicate email → 409', async () => {
        // First registration — succeeds
        await request
            .post('/users/register')
            .send({ email: 'dup@example.com', userName: 'First', password: 'pass1' });

        // Second registration with the same email — must fail
        const res = await request
            .post('/users/register')
            .send({ email: 'dup@example.com', userName: 'Second', password: 'pass2' });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('already registered');
    });

    it.each([
        { email: 'not-an-email', userName: 'Valid', password: 'password' },
        { email: 'valid@example.com', userName: '', password: 'password' },
        { email: 'valid@example.com', userName: 'Valid', password: '' },
        { email: 'valid@example.com', userName: 'Valid', password: 'password', role: 'admin' },
    ])('POST /users/register rejects invalid input: %o', async body => {
        const res = await request.post('/users/register').send(body);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('request validation failed');
        expect(res.body.details).toEqual(expect.any(Array));
    });

    // 3 ────────────────────────────────────────────────────────────────
    it('POST /users/login → 200 with access_token and refresh cookie', async () => {
        // Seed a user
        await request
            .post('/users/register')
            .send({ email: 'login@example.com', userName: 'LoginUser', password: 'secure123' });

        const res = await request
            .post('/users/login')
            .send({ email: 'login@example.com', password: 'secure123' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user).toMatchObject({ email: 'login@example.com' });
        expect(res.body.data.access_token).toBeDefined();

        // refresh token is set as an HttpOnly cookie
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const cookieString = Array.isArray(cookies) ? cookies.join(';') : String(cookies);
        expect(cookieString).toMatch(/refresh_token=/);
        expect(cookieString).toMatch(/HttpOnly/);
    });

    // 4 ────────────────────────────────────────────────────────────────
    it('POST /users/login with wrong password → 401', async () => {
        await request
            .post('/users/register')
            .send({ email: 'bad@example.com', userName: 'BadPwd', password: 'secure123' });

        const res = await request
            .post('/users/login')
            .send({ email: 'bad@example.com', password: 'wrong-password' });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    // 5 ────────────────────────────────────────────────────────────────
    it('GET /users/profile with valid Bearer token → 200', async () => {
        const { body } = await request
            .post('/users/register')
            .send({ email: 'profile@example.com', userName: 'ProfileUser', password: 'secure123' });

        const token: string = body.data.access_token;

        const res = await request
            .get('/users/profile')
            .set(auth(token));

        expect(res.status).toBe(200);
        // NOTE: the profile controller returns the user object directly (not wrapped in {success,data})
        expect(res.body.email).toBe('profile@example.com');
        expect(res.body.name).toBe('ProfileUser');
        expect(res.body.role).toBe('customer');
    });

    // 6 ────────────────────────────────────────────────────────────────
    it('GET /users/profile without token → 401', async () => {
        const res = await request.get('/users/profile');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Missing or malformed authorization header');
    });

    // 7 ────────────────────────────────────────────────────────────────
    it('GET /users (admin-only) without auth → 401', async () => {
        const res = await request.get('/users');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Missing or malformed authorization header');
    });

    // 8 ────────────────────────────────────────────────────────────────
    it('GET /users (admin-only) as customer → 403', async () => {
        const { body } = await request
            .post('/users/register')
            .send({ email: 'just-a-cust@example.com', userName: 'Customer', password: 'secure123' });

        const res = await request
            .get('/users')
            .set(auth(body.data.access_token));

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Forbidden/i);
    });

    // 9 ────────────────────────────────────────────────────────────────
    it('GET /users (admin-only) as admin → 200', async () => {
        const { token } = await seedAdmin('AdminUser', 'admin@ecom.test');

        const res = await request
            .get('/users')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 10 ────────────────────────────────────────────────────────────────
    it('DELETE /users/:id as admin → 200', async () => {
        // Create a user to delete
        const { body: reg } = await request
            .post('/users/register')
            .send({ email: 'deleteme@example.com', userName: 'DeleteMe', password: 'secure123' });
        const userId: number = reg.data.user.id;

        // Get an admin token
        const { token } = await seedAdmin('AdminDelete', 'admin-del@ecom.test');

        const res = await request
            .delete(`/users/${userId}`)
            .set(auth(token));

        // NOTE: The current deleteById() in userRepository does NOT use RETURNING *,
        // so rows[0] is undefined and the controller returns 500.
        // If this test fails with 500, add RETURNING * to the DELETE query in
        // src/repositories/userRepository.ts deleteById().
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    // 11 ────────────────────────────────────────────────────────────────
    it('PATCH /users/:id/role as admin → 200', async () => {
        // Create a user whose role we will change
        const { body: reg } = await request
            .post('/users/register')
            .send({ email: 'role-me@example.com', userName: 'RoleUser', password: 'secure123' });
        const userId: number = reg.data.user.id;

        // Get an admin token
        const { token } = await seedAdmin('AdminRole', 'admin-role@ecom.test');

        const res = await request
            .patch(`/users/${userId}/role`)
            .set(auth(token))
            .send({ role: 'admin' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.role).toBe('admin');
    });

    it('rejects invalid admin user ids and roles', async () => {
        const { token } = await seedAdmin('AdminValidation', 'admin-validation@ecom.test');

        const invalidId = await request
            .delete('/users/not-a-number')
            .set(auth(token));
        expect(invalidId.status).toBe(400);
        expect(invalidId.body.details).toEqual([
            expect.objectContaining({ path: 'id' }),
        ]);

        const invalidRole = await request
            .patch('/users/1/role')
            .set(auth(token))
            .send({ role: 'superadmin' });
        expect(invalidRole.status).toBe(400);
        expect(invalidRole.body.details).toEqual([
            expect.objectContaining({ path: 'role' }),
        ]);
    });
});
