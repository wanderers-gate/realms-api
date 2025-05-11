import mongoose from 'mongoose';
import config from './config/config';
import connectDB from './config/database';
import logger from './utils/logger';

import app from './index';

let server: ReturnType<typeof app.listen>;

const startServer = async (): Promise<void> => {
  await connectDB();
  server = app.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port}`);
  });
};

const shutdown = async (): Promise<void> => {
  logger.info('Shutting down server...');
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        logger.info('Server closed');
        resolve();
      });
    });
  }
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
  process.exit(0);
};

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
