import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { UserModel } from '../../models/user-model';
import type { UserDocument } from '../../models/user-model';
import { serializeUser } from '../../serializers/user.serializer';
import { generateToken } from '../../utils/jwt';
import { login, logout, register } from '../auth.controller';

// Mock dependencies
jest.mock('../../models/user-model');
jest.mock('../../serializers/user.serializer');
jest.mock('../../utils/jwt');

interface MockUser extends Partial<UserDocument> {
  _id: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  tokenVersion: number;
  comparePassword: jest.Mock;
  save: jest.Mock;
}

interface MockRequest extends Partial<Request> {
  body: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}

// Create a mock response factory
const createMockResponse = () => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    send: jest.fn(),
    jsonApiError: jest.fn(),
  };
  return res as Response;
};

describe('Auth Controller', () => {
  let mockRequest: MockRequest;
  let mockResponse: Response;
  let mockUser: MockUser;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock user
    mockUser = {
      _id: new Types.ObjectId(),
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      tokenVersion: 0,
      comparePassword: jest.fn(),
      save: jest.fn(),
    };

    // Setup mock request with extracted attributes (simulating middleware)
    mockRequest = {
      body: {
        email: 'test@example.com',
        password: 'password',
        firstName: 'Test',
        lastName: 'User',
      },
    };

    // Setup mock response
    mockResponse = createMockResponse();

    // Setup mock implementations
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    (UserModel as unknown as jest.Mock).mockImplementation(() => mockUser);
    (serializeUser as jest.Mock).mockReturnValue({ data: { id: mockUser._id.toString() } });
    (generateToken as jest.Mock).mockReturnValue('mock-token');
  });

  describe('register', () => {
    it('should register a new user', async () => {
      await register(mockRequest as Request, mockResponse);

      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(UserModel).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(mockUser.save).toHaveBeenCalled();
      expect(generateToken).toHaveBeenCalledWith(mockUser._id.toString(), 0);
      expect(mockResponse.cookie).toHaveBeenCalledWith('token', 'mock-token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000,
      });
      expect(serializeUser).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({ data: { id: mockUser._id.toString() } });
    });

    it('should not register if user exists', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(mockUser);

      await register(mockRequest as Request, mockResponse);

      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(400, [
        {
          status: '400',
          title: 'Bad Request',
          detail: 'User already exists',
        },
      ]);
    });
  });

  describe('login', () => {
    it('should login a user and return a token', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(mockUser);
      mockUser.comparePassword.mockResolvedValue(true);

      await login(mockRequest as Request, mockResponse);

      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password');
      expect(mockUser.tokenVersion).toBe(1);
      expect(mockUser.save).toHaveBeenCalled();
      expect(generateToken).toHaveBeenCalledWith(mockUser._id.toString(), 1);
      expect(mockResponse.cookie).toHaveBeenCalledWith('token', 'mock-token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 3600000,
      });
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should not login with invalid credentials', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(mockUser);
      mockUser.comparePassword.mockResolvedValue(false);

      await login(mockRequest as Request, mockResponse);

      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password');
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'Invalid credentials',
          },
        ],
      });
    });
  });

  describe('logout', () => {
    it('should clear the token cookie', () => {
      logout(mockRequest as Request, mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });
  });

  describe('Token Versioning', () => {
    it('should invalidate the old token after a new login', async () => {
      // Setup mocks for user
      (UserModel.findOne as jest.Mock).mockResolvedValue(mockUser);
      mockUser.comparePassword.mockResolvedValue(true);

      // First login
      await login(mockRequest as Request, mockResponse);
      const firstTokenCall = (generateToken as jest.Mock).mock.calls[0];
      const firstTokenVersion = firstTokenCall[1];
      const firstToken = (generateToken as jest.Mock).mock.results[0].value;

      // Simulate token in cookie for middleware
      const reqWithFirstToken = { cookies: { token: firstToken } } as unknown as Request;
      // Simulate user in DB with incremented tokenVersion after second login
      mockUser.tokenVersion = firstTokenVersion + 1;
      (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);
      // Simulate decoded token with old version
      (require('../../utils/jwt').verifyJwt as jest.Mock).mockReturnValue({
        userId: mockUser._id.toString(),
        tokenVersion: firstTokenVersion,
      });

      // Call authenticate middleware
      const next = jest.fn();
      const { authenticate } = require('../../middleware/auth.middleware');
      await authenticate(reqWithFirstToken, mockResponse, next);

      // Should reject the old token
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'Invalid token',
          },
        ],
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
