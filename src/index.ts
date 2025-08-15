import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { authenticate } from './middleware/auth.middleware';
import { jsonApiMiddleware } from './middleware/json-api';
import authRouter from './routes/authRouter';
import authProtectedRouter from './routes/authProtectedRouter';
import roomRouter from './routes/roomRouter';
import userRouter from './routes/userRouter';

const app = express();

const allowedOrigins = [
  'http://localhost:5174',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://realmsapp.io',
  'https://realmsapp.io',
];

// CORS configuration
app.use(
  cors({
    // origin: process.env.FRONTEND_URL || 'http://localhost:5174',
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
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

// Routes that don't need authentication
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomRouter); // Room listing and viewing are public

// Routes that require authentication
app.use(authenticate);
app.use('/api/auth', authProtectedRouter);
app.use('/api/users', userRouter);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({
    errors: [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: process.env.NODE_ENV === 'production' ? 'An internal error occurred' : err.message,
      },
    ],
  });
});

export default app;
