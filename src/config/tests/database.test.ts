import logger from '../../utils/logger';
import runMigrations from '../database';

jest.mock('../../db', () => ({ db: {} }));
jest.mock('drizzle-orm/better-sqlite3/migrator', () => ({
  migrate: jest.fn(),
}));

describe('Database Migrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('should run migrations successfully', () => {
    const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
    migrate.mockImplementation(() => {});

    runMigrations();

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Database migrations completed successfully');
  });

  it('should exit process on migration error', () => {
    const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
    const mockError = new Error('Migration failed');
    migrate.mockImplementation(() => {
      throw mockError;
    });

    runMigrations();

    expect(logger.error).toHaveBeenCalledWith('Database migration error:', mockError);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
