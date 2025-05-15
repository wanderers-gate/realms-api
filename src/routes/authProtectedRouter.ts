import { Router } from 'express';
import { authCheck, logout } from '../controllers/auth.controller';

const authProtectedRouter = Router();

// Protected auth routes (require authentication)
authProtectedRouter.get('/check', authCheck);
authProtectedRouter.post('/logout', logout);

export default authProtectedRouter; 