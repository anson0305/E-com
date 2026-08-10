import { Router } from 'express';
import { listCategories, getCategory, createCategory } from '../controllers/categoryController.js';
import { JWT_auth } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.get('/', listCategories);
router.get('/:id', getCategory);
router.post('/', JWT_auth, authorize('admin'), createCategory);

export default router;
