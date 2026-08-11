import { Router } from 'express';
import { findAllProduct, searchProduct, createProduct, updateProduct, deleteProduct } from '../controllers/productController.js';
import { JWT_auth } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
    createProductBodySchema,
    listProductsQuerySchema,
    productIdParamsSchema,
    searchProductsQuerySchema,
    updateProductBodySchema,
} from '../schemas/productSchemas.js';

const router = Router();

router.get('/', validateQuery(listProductsQuerySchema), findAllProduct);
router.get('/search', validateQuery(searchProductsQuerySchema), searchProduct);
router.post('/', JWT_auth, authorize('admin'), validateBody(createProductBodySchema), createProduct);
router.put('/:id', JWT_auth, authorize('admin'), validateParams(productIdParamsSchema), validateBody(updateProductBodySchema), updateProduct);
router.delete('/:id', JWT_auth, authorize('admin'), validateParams(productIdParamsSchema), deleteProduct);

export default router;
