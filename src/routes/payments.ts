import { Router } from 'express';
import {
    cancelOrder,
    checkout,
    getOrder,
    releaseExpiredReservations,
    stripeWebhook,
} from '../controllers/paymentController.js';
import { JWT_auth } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { checkoutLimiter } from '../middleware/rateLimit.js';
import { validateHeaders, validateParams } from '../middleware/validate.js';
import { checkoutHeadersSchema, orderIdParamsSchema } from '../schemas/paymentSchemas.js';

const router = Router();

// This route receives the raw body configured in app.ts and must not use JWT auth.
router.post('/webhook', stripeWebhook);

router.use(JWT_auth);
router.post('/checkout', checkoutLimiter, validateHeaders(checkoutHeadersSchema), checkout);
router.get('/orders/:id', validateParams(orderIdParamsSchema), getOrder);
router.post('/orders/:id/cancel', validateParams(orderIdParamsSchema), cancelOrder);
router.post('/maintenance/release-expired', authorize('admin'), releaseExpiredReservations);

export default router;
