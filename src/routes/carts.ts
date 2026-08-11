import { Router } from 'express';
import { getCart, addItem, updateQuantity, removeItem, clearCart } from '../controllers/cartController.js';
import { JWT_auth } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
    addCartItemBodySchema,
    cartItemParamsSchema,
    updateCartItemBodySchema,
} from '../schemas/cartSchemas.js';

const router = Router();

// All cart routes require authentication
router.use(JWT_auth);

router.get('/', getCart);
router.post('/items', validateBody(addCartItemBodySchema), addItem);
router.patch(
    '/items/:id',
    validateParams(cartItemParamsSchema),
    validateBody(updateCartItemBodySchema),
    updateQuantity,
);
router.delete('/items/:id', validateParams(cartItemParamsSchema), removeItem);
router.delete('/', clearCart);

export default router;
