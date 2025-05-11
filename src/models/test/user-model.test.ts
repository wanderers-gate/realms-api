import * as argon2 from 'argon2';
import mongoose from 'mongoose';
import { UserModel } from '../user-model';

// Mock argon2
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  verify: jest.fn().mockResolvedValue(true),
}));

describe('User Model', () => {
  beforeAll(async () => {
    // Connect to a test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    // Close the database connection
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    // Clear the User collection
    await UserModel.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const user = await UserModel.create(userData);

      expect(user.email).toBe(userData.email);
      expect(user.firstName).toBe(userData.firstName);
      expect(user.lastName).toBe(userData.lastName);
      expect(user.password).toBe('hashed_password'); // Password should be hashed
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should fail to create a user without required fields', async () => {
      const userData = {
        email: 'test@example.com',
        // Missing password, firstName, lastName
      };

      await expect(UserModel.create(userData)).rejects.toThrow();
    });

    it('should fail to create a user with invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(UserModel.create(userData)).rejects.toThrow();
    });

    it('should not allow duplicate email addresses', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      await UserModel.create(userData);
      await expect(UserModel.create(userData)).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const user = await UserModel.create(userData);

      expect(argon2.hash).toHaveBeenCalledWith(userData.password, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });
      expect(user.password).toBe('hashed_password');
    });

    it('should not hash password if not modified', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const user = await UserModel.create(userData);
      jest.clearAllMocks();

      user.firstName = 'Jane';
      await user.save();

      expect(argon2.hash).not.toHaveBeenCalled();
    });
  });

  describe('Password Comparison', () => {
    it('should compare passwords correctly', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const user = await UserModel.create(userData);

      const isMatch = await user.comparePassword('password123');
      expect(isMatch).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith('hashed_password', 'password123');
    });

    it('should return false for incorrect password', async () => {
      (argon2.verify as jest.Mock).mockResolvedValueOnce(false);

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const user = await UserModel.create(userData);

      const isMatch = await user.comparePassword('wrongpassword');
      expect(isMatch).toBe(false);
    });

    it('should handle verification errors gracefully', async () => {
      (argon2.verify as jest.Mock).mockRejectedValueOnce(new Error('Verification failed'));

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const user = await UserModel.create(userData);

      const isMatch = await user.comparePassword('password123');
      expect(isMatch).toBe(false);
    });
  });
});
