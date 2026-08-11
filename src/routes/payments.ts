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

const router = Router();

// This route receives the raw body configured in app.ts and must not use JWT auth.
router.post('/webhook', stripeWebhook);

router.use(JWT_auth);
router.post('/checkout', checkout);
router.get('/orders/:id', getOrder);
router.post('/orders/:id/cancel', cancelOrder);
router.post('/maintenance/release-expired', authorize('admin'), releaseExpiredReservations);

export default router;
