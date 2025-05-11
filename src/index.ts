import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authenticate } from './middleware/auth.middleware';
import { jsonApiMiddleware } from './middleware/json-api';
import authRouter from './routes/authRouter';
import userRouter from './routes/userRouter';

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(jsonApiMiddleware);

// Public routes
app.use('/api/auth', authRouter);

// app.use(authenticate);

// Protected routes
app.use('/api/users', authenticate, userRouter);

export default app;
