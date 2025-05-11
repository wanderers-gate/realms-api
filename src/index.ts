import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { authenticate } from './middleware/auth.middleware';
import { jsonApiMiddleware } from './middleware/json-api';
import authRouter from './routes/authRouter';
import userRouter from './routes/userRouter';

const app = express();

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Handle preflight requests explicitly
app.options('*', cors());

// Parse request body first
app.use(
  express.json({
    type: ['application/json', 'application/vnd.api+json'],
  })
);
app.use(cookieParser());

// Then process JSON:API format
app.use(jsonApiMiddleware);

// Routes
app.use('/api/auth', authRouter);
app.use(authenticate);

app.use('/api/users', userRouter);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    errors: [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: err.message,
      },
    ],
  });
});

export default app;
