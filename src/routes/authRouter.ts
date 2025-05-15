import { Router } from 'express';
import { login, register } from '../controllers/auth.controller';

const authRouter = Router();

// Public auth routes
authRouter.post('/register', register);
authRouter.post('/login', login);

export default authRouter;
