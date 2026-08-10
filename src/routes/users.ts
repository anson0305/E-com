import { Router } from 'express';
import { register, login, profile, refresh, listUsers, removeUser, changeRole} from '../controllers/userController.js';
import { authorize } from '../middleware/authorize.js';
import { JWT_auth } from '../middleware/auth.js';

const router = Router();

router.get('/', JWT_auth, authorize('admin'), listUsers);
router.delete('/:id', JWT_auth, authorize('admin'), removeUser);
router.patch('/:id/role', JWT_auth, authorize('admin'), changeRole);
router.post('/register', register);
router.post('/login', login);
router.get('/profile', JWT_auth, profile);
router.post('/refresh', refresh);
// router.get('/logout', logout);

export default router;