import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Imports under test (no mocking — we want real bcrypt + jwt behaviour)
// ---------------------------------------------------------------------------

import {
    hashPwd,
    verifyPwd,
    genJwtAccessToken,
    genJwtRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
} from '../../../src/services/JWT.js';
import type { UserPayload } from '../../../src/services/JWT.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<UserPayload> = {}): UserPayload {
    return {
        userId: '42',
        email: 'user@example.com',
        role: 'customer',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JWT service', () => {
    // -- hashPwd -------------------------------------------------------------

    describe('hashPwd', () => {
        it('returns a bcrypt hash different from the input', async () => {
            const password = 'mySecret123';
            const hash = await hashPwd(password);

            expect(hash).not.toBe(password);
            expect(hash).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
        });
    });

    // -- verifyPwd -----------------------------------------------------------

    describe('verifyPwd', () => {
        it('returns true for correct password', async () => {
            const password = 'correct';
            const hash = await bcrypt.hash(password, 10);

            const result = await verifyPwd(hash, password);

            expect(result).toBe(true);
        });

        it('returns false for wrong password', async () => {
            const hash = await bcrypt.hash('correct', 10);

            const result = await verifyPwd(hash, 'wrong');

            expect(result).toBe(false);
        });
    });

    // -- genJwtAccessToken / verifyAccessToken -------------------------------

    describe('access token round-trip', () => {
        it('generates a string token', () => {
            const payload = makePayload();
            const token = genJwtAccessToken(payload);

            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // JWT has 3 segments
        });

        it('verifyAccessToken decodes valid token back to original payload', () => {
            const payload = makePayload({ userId: '7', email: 'a@b.com', role: 'admin' });
            const token = genJwtAccessToken(payload);

            const decoded = verifyAccessToken(token) as UserPayload;

            expect(decoded.userId).toBe('7');
            expect(decoded.email).toBe('a@b.com');
            expect(decoded.role).toBe('admin');
        });
    });

    // -- genJwtRefreshToken / verifyRefreshToken -----------------------------

    describe('refresh token round-trip', () => {
        it('verifyRefreshToken decodes valid refresh token back to original payload', () => {
            const payload = { userId: '99', email: 'refresh@example.com', role: 'customer' as const };
            const token = genJwtRefreshToken(payload);

            const decoded = verifyRefreshToken(token) as UserPayload;

            expect(decoded.userId).toBe('99');
            expect(decoded.email).toBe('refresh@example.com');
            expect(decoded.role).toBe('customer');
        });
    });

    // -- verifyAccessToken error cases ---------------------------------------

    describe('verifyAccessToken errors', () => {
        it('throws TokenExpiredError for expired token', async () => {
            // Sign a token that expires immediately
            const expiredToken = jwt.sign(
                { userId: '1', email: 'x@y.com', role: 'customer' },
                // Access the fallback secret directly — it is what the module uses
                'access_secret_key',
                { expiresIn: '0s' },
            );

            // Small delay to ensure the token has actually expired
            await new Promise((r) => setTimeout(r, 10));

            expect(() => verifyAccessToken(expiredToken)).toThrow();
        });

        it('throws on garbage input', () => {
            expect(() => verifyAccessToken('not.a.valid.jwt')).toThrow();
        });
    });
});
