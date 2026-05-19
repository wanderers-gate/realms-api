import logger from '../logger';

describe('Logger', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('info', () => {
    it('should log info message with prefix', () => {
      logger.info('Test info message');
      expect(console.log).toHaveBeenCalledWith('[INFO] Test info message');
    });

    it('should log info message with additional arguments', () => {
      const arg1 = { key: 'value' };
      const arg2 = 123;
      logger.info('Test info message', arg1, arg2);
      expect(console.log).toHaveBeenCalledWith('[INFO] Test info message', arg1, arg2);
    });
  });

  describe('warn', () => {
    it('should log warning message with prefix', () => {
      logger.warn('Test warning message');
      expect(console.warn).toHaveBeenCalledWith('[WARN] Test warning message');
    });

    it('should log warning message with additional arguments', () => {
      const arg1 = { key: 'value' };
      const arg2 = 123;
      logger.warn('Test warning message', arg1, arg2);
      expect(console.warn).toHaveBeenCalledWith('[WARN] Test warning message', arg1, arg2);
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
