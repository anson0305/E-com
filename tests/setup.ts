import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Build a mock Express Response object.
 * Tracks calls to .status() and .json() so tests can assert on them.
 */
export function mockRes() {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    return res as Response;
}

/**
 * Build a mock Express Request with just the fields you need.
 */
export function mockReq(overrides: Partial<Request> = {}): Request {
    return {
        body: {},
        params: {},
        query: {},
        cookies: {},
        headers: {},
        jwtPayload: undefined,
        ...overrides,
    } as Request;
}

/**
 * A no-op next function for middleware tests.
 */
export function mockNext(): NextFunction {
    return vi.fn() as NextFunction;
}
