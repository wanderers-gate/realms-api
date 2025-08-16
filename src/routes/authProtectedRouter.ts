import { Router } from 'express';
import { authCheck, getCurrentUser, logout } from '../controllers/auth.controller';

const authProtectedRouter = Router();

// Protected auth routes (require authentication)
authProtectedRouter.get('/check', authCheck);
authProtectedRouter.get('/me', getCurrentUser);
authProtectedRouter.post('/logout', logout);

export default authProtectedRouter;
