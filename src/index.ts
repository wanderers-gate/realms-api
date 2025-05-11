import cors from 'cors';
import express from 'express';
import { jsonApiMiddleware } from './middleware/json-api';
import { authenticateJwt } from './middleware/authenticate';
import authRouter from './routes/authRouter';
import userRouter from './routes/userRouter';

const app = express();

app.use(express.json());
app.use(cors());
app.use(jsonApiMiddleware);

app.use('/api/auth', authRouter);

app.use(authenticateJwt());
app.use('/api/users', userRouter);

export default app;
