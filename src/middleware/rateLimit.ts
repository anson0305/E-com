import rateLimit from 'express-rate-limit';

const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

function skipInTests() {
    return isTestEnvironment;
}

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipInTests,
    message: { success: false, error: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipInTests,
    message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

export const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipInTests,
    message: { success: false, error: 'Too many checkout attempts, please try again later.' },
});
