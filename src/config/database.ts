import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../db';
import logger from '../utils/logger';

const runMigrations = (): void => {
  try {
    logger.info('Running database migrations...');
    // Resolved from cwd, not __dirname: the esbuild bundle puts __dirname at dist/
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Database migration error:', error);
    process.exit(1);
  }
};

export default runMigrations;
