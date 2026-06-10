import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import config from './config/config';
import { authenticate } from './middleware/auth.middleware';
import { jsonApiMiddleware } from './middleware/json-api';
import authProtectedRouter from './routes/authProtectedRouter';
import authRouter from './routes/authRouter';
import canvasRouter from './routes/canvasRouter';
import characterSheetRouter from './routes/characterSheetRouter';
import filesRouter from './routes/filesRouter';
import playerRouter from './routes/playerRouter';
import roomRouter from './routes/roomRouter';
import userRouter from './routes/userRouter';
import logger from './utils/logger';

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!config.allowedOrigins.includes(origin)) {
        return callback(
          new Error(
            'The CORS policy for this site does not allow access from the specified Origin.'
          ),
          false
        );
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.options('*', cors());

app.use(express.json({ type: ['application/json', 'application/vnd.api+json'] }));
app.use(cookieParser());
app.use(jsonApiMiddleware);
app.use('/uploads', express.static(config.dataDir));

app.use('/api/auth', authRouter);
app.use('/api/rooms', roomRouter);
app.use('/api/canvas', canvasRouter);
app.use('/api/files', filesRouter);
app.use('/api/players', playerRouter);
app.use('/api/character-sheets', characterSheetRouter);

app.use('/api/auth', authenticate, authProtectedRouter);
app.use('/api/users', authenticate, userRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({
    errors: [{ status: '404', title: 'Not Found', detail: 'The requested resource was not found' }],
  });
});

if (config.nodeEnv === 'production') {
  app.use(express.static(config.staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(config.staticDir, 'index.html'));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err.stack);
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
