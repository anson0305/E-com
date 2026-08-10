import { Router } from 'express';
import { findAllProduct, searchProduct, createProduct, updateProduct, deleteProduct } from '../controllers/productController.js';
import { JWT_auth } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.get('/', findAllProduct);
router.get('/search', searchProduct);
router.post('/', JWT_auth, authorize('admin'), createProduct);
router.put('/:id', JWT_auth, authorize('admin'), updateProduct);
router.delete('/:id', JWT_auth, authorize('admin'), deleteProduct);

export default router;