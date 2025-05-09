import mongoose from 'mongoose';
import connectDB from '../database';
import config from '../config';

// Mock mongoose
jest.mock('mongoose', () => ({
  connect: jest.fn(),
}));

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
});

describe('Database Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should connect to MongoDB successfully', async () => {
    // Mock successful connection
    (mongoose.connect as jest.Mock).mockResolvedValueOnce(undefined);

    await connectDB();
    
    // Verify mongoose.connect was called with correct parameters
    expect(mongoose.connect).toHaveBeenCalledWith(
      config.mongodb.uri,
      config.mongodb.options
    );
    
    // Verify success message was logged
    expect(console.log).toHaveBeenCalledWith('MongoDB connected successfully');
  });

  it('should handle connection errors', async () => {
    // Mock connection error
    const error = new Error('Connection failed');
    (mongoose.connect as jest.Mock).mockRejectedValueOnce(error);

    // Mock process.exit
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await connectDB();
    
    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith('MongoDB connection error:', error);
    
    // Verify process.exit was called with code 1
    expect(mockExit).toHaveBeenCalledWith(1);
    
    // Restore process.exit
    mockExit.mockRestore();
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