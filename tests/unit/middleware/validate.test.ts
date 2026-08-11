import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { validateHeaders, validateParams } from '../../../src/middleware/validate.js';
import { orderIdParamsSchema, checkoutHeadersSchema } from '../../../src/schemas/paymentSchemas.js';

function runMiddleware(
    middleware: ReturnType<typeof validateHeaders> | ReturnType<typeof validateParams>,
    options: { params?: Record<string, string>; idempotencyKey?: string },
) {
    const req = {
        params: options.params ?? {},
        get: (name: string) => name === 'Idempotency-Key' ? options.idempotencyKey : undefined,
    } as unknown as Request;
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        locals: {},
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);
    return { res, next };
}

describe('validation middleware', () => {
    it('rejects an empty Idempotency-Key before checkout', () => {
        const { res, next } = runMiddleware(
            validateHeaders(checkoutHeadersSchema),
            { idempotencyKey: '' },
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: 'request validation failed',
        }));
        expect(next).not.toHaveBeenCalled();
    });

    it('accepts a valid Idempotency-Key and positive order id', () => {
        const header = runMiddleware(
            validateHeaders(checkoutHeadersSchema),
            { idempotencyKey: 'checkout-abc-123' },
        );
        const params = runMiddleware(
            validateParams(orderIdParamsSchema),
            { params: { id: '42' } },
        );

        expect(header.next).toHaveBeenCalledOnce();
        expect(params.next).toHaveBeenCalledOnce();
    });
});
