import logger from '../logger';

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore console methods
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('info', () => {
    it('should log info message with prefix', () => {
      const message = 'Test info message';
      logger.info(message);

      expect(consoleSpy).toHaveBeenCalledWith('[INFO] Test info message');
    });

    it('should log info message with additional arguments', () => {
      const message = 'Test info message';
      const arg1 = { key: 'value' };
      const arg2 = 123;

      logger.info(message, arg1, arg2);

      expect(consoleSpy).toHaveBeenCalledWith('[INFO] Test info message', arg1, arg2);
    });
  });

  describe('warn', () => {
    it('should log warning message with prefix', () => {
      const message = 'Test warning message';
      logger.warn(message);

      expect(consoleSpy).toHaveBeenCalledWith('[WARN] Test warning message');
    });

    it('should log warning message with additional arguments', () => {
      const message = 'Test warning message';
      const arg1 = { key: 'value' };
      const arg2 = 123;

      logger.warn(message, arg1, arg2);

      expect(consoleSpy).toHaveBeenCalledWith('[WARN] Test warning message', arg1, arg2);
    });
  });

  describe('error', () => {
    it('should log error message with prefix', () => {
      const message = 'Test error message';
      logger.error(message);

      expect(console.error).toHaveBeenCalledWith('[ERROR] Test error message');
    });

    it('should log error message with additional arguments', () => {
      const message = 'Test error message';
      const arg1 = new Error('Test error');
      const arg2 = { context: 'test' };

      logger.error(message, arg1, arg2);

      expect(console.error).toHaveBeenCalledWith('[ERROR] Test error message', arg1, arg2);
    });
  });
});
