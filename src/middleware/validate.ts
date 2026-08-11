import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

function validationErrorResponse(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
    return {
        success: false,
        error: 'request validation failed',
        details: error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
        })),
    };
}

export function validateBody(schema: ZodType): RequestHandler {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            res.status(400).json(validationErrorResponse(result.error));
            return;
        }

        req.body = result.data;
        next();
    };
}

export function validateParams(schema: ZodType): RequestHandler {
    return (req, res, next) => {
        const result = schema.safeParse(req.params);

        if (!result.success) {
            res.status(400).json(validationErrorResponse(result.error));
            return;
        }

        next();
    };
}

export function validateQuery(schema: ZodType): RequestHandler {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);

        if (!result.success) {
            res.status(400).json(validationErrorResponse(result.error));
            return;
        }

        res.locals.validatedQuery = result.data;
        next();
    };
}

export function validateHeaders(schema: ZodType): RequestHandler {
    return (req, res, next) => {
        const result = schema.safeParse({
            idempotency_key: req.get('Idempotency-Key') ?? undefined,
        });

        if (!result.success) {
            res.status(400).json(validationErrorResponse(result.error));
            return;
        }

        res.locals.validatedHeaders = result.data;
        next();
    };
}
