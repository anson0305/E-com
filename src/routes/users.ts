import { Router } from 'express';
import { register, login, profile, refresh, listUsers, removeUser, changeRole} from '../controllers/userController.js';
import { authorize } from '../middleware/authorize.js';
import { JWT_auth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
    changeRoleBodySchema,
    loginBodySchema,
    registerBodySchema,
    userIdParamsSchema,
} from '../schemas/userSchemas.js';

const router = Router();

router.get('/', JWT_auth, authorize('admin'), listUsers);
router.delete('/:id', JWT_auth, authorize('admin'), validateParams(userIdParamsSchema), removeUser);
router.patch('/:id/role', JWT_auth, authorize('admin'), validateParams(userIdParamsSchema), validateBody(changeRoleBodySchema), changeRole);
router.post('/register', authLimiter, validateBody(registerBodySchema), register);
router.post('/login', authLimiter, validateBody(loginBodySchema), login);
router.get('/profile', JWT_auth, profile);
router.post('/refresh', refresh);
// router.get('/logout', logout);

export default router;
