import { Router } from 'express';
import { authCheck, login, logout, register } from '../controllers/auth.controller';

const authRouter = Router();

authRouter.get('/check', authCheck);
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/logout', logout);

export default authRouter;
