import mongoose from 'mongoose';

import logger from '../../utils/logger';
import config from '../config';
import connectDB from '../database';

jest.mock('mongoose');
jest.mock('../config');

describe('Database Connection', () => {
  const originalConsole = { ...console };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  it('should connect to MongoDB successfully', async () => {
    const mockConnect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

    await connectDB();

    expect(mockConnect).toHaveBeenCalledWith(config.mongodb.uri, config.mongodb.options);
    expect(logger.info).toHaveBeenCalledWith('Connected to MongoDB');
  });

  it('should exit process on connection error', async () => {
    const mockError = new Error('Connection failed');
    jest.spyOn(mongoose, 'connect').mockRejectedValue(mockError);
    const mockExit = jest.spyOn(process, 'exit');

    await connectDB();

    expect(logger.error).toHaveBeenCalledWith('MongoDB connection error:', mockError);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should use correct MongoDB URI from config', async () => {
    // Mock successful connection
    (mongoose.connect as jest.Mock).mockResolvedValueOnce(undefined);

    await connectDB();
    
    // Verify the correct URI was used
    expect(mongoose.connect).toHaveBeenCalledWith(
      expect.stringContaining('mongodb://'),
      expect.any(Object)
    );
  });

  it('should use correct MongoDB options from config', async () => {
    // Mock successful connection
    (mongoose.connect as jest.Mock).mockResolvedValueOnce(undefined);

    await connectDB();
    
    // Verify the correct options were used
    expect(mongoose.connect).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        autoIndex: true
      })
    );
  });
}); 