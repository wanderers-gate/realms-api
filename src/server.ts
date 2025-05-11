import config from './config/config';
import connectDB from './config/database';
import logger from './utils/logger';

import app from './index';

const startServer = async (): Promise<void> => {
  await connectDB();
  app.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port}`);
  });
};

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
