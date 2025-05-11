import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { UserModel } from '../user-model';

describe('User Model', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
      await mongoServer.stop();
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  });

  beforeEach(async () => {
    // Clear the User collection
    await UserModel.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.firstName).toBe(userData.firstName);
      expect(savedUser.lastName).toBe(userData.lastName);
      expect(savedUser.password).not.toBe(userData.password); // Password should be hashed
    });

    it('should fail to create a user without required fields', async () => {
      const userData = {
        email: 'test@example.com',
        // Missing password
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should fail to create a user with invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should not allow duplicate email addresses', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      await UserModel.create(userData);
      const duplicateUser = new UserModel(userData);
      await expect(duplicateUser.save()).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      const savedUser = await user.save();

      expect(savedUser.password).not.toBe(userData.password);
      expect(savedUser.password).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/); // argon2 hash format
    });

    it('should not hash password if not modified', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      const savedUser = await user.save();
      const originalHash = savedUser.password;

      savedUser.firstName = 'Updated';
      const updatedUser = await savedUser.save();

      expect(updatedUser.password).toBe(originalHash);
    });
  });

  describe('Password Comparison', () => {
    it('should compare passwords correctly', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      const savedUser = await user.save();

      const isMatch = await savedUser.comparePassword('password123');
      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      const savedUser = await user.save();

      const isMatch = await savedUser.comparePassword('wrongpassword');
      expect(isMatch).toBe(false);
    });

    it('should handle verification errors gracefully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new UserModel(userData);
      const savedUser = await user.save();

      // Corrupt the password hash
      savedUser.password = 'invalid-hash';
      await savedUser.save();

      const isMatch = await savedUser.comparePassword('password123');
      expect(isMatch).toBe(false);
    });
  });
});
