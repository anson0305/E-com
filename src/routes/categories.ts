import { Router } from 'express';
import { listCategories, getCategory, createCategory } from '../controllers/categoryController.js';
import { JWT_auth } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { categoryIdParamsSchema, createCategoryBodySchema } from '../schemas/categorySchemas.js';

const router = Router();

router.get('/', listCategories);
router.get('/:id', validateParams(categoryIdParamsSchema), getCategory);
router.post('/', JWT_auth, authorize('admin'), validateBody(createCategoryBodySchema), createCategory);

export default router;
