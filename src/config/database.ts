import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../db';
import logger from '../utils/logger';

const runMigrations = (): void => {
  try {
    logger.info('Running database migrations...');
    migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Database migration error:', error);
    process.exit(1);
  }
};

export default runMigrations;
