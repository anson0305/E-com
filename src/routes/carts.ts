import { Router } from 'express';
import { getCart, addItem, updateQuantity, removeItem, clearCart } from '../controllers/cartController.js';
import { JWT_auth } from '../middleware/auth.js';

const router = Router();

// All cart routes require authentication
router.use(JWT_auth);

router.get('/', getCart);
router.post('/items', addItem);
router.patch('/items/:id', updateQuantity);
router.delete('/items/:id', removeItem);
router.delete('/', clearCart);

export default router;