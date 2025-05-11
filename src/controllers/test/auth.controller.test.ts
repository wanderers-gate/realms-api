import { register, login, logout } from '../auth.controller';
import { UserModel } from '../../models/user-model';
import { serializeUser } from '../../serializers/user.serializer';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';

// Mock dependencies
jest.mock('../../models/user-model');
jest.mock('../../serializers/user.serializer');
jest.mock('jsonwebtoken');

type MockResponse = {
  status: jest.Mock;
  json: jest.Mock;
  clearCookie: jest.Mock;
  jsonApiError: jest.Mock;
};

type MockRequest = {
  body: Record<string, unknown>;
};

describe('Auth Controller', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      clearCookie: jest.fn(),
      jsonApiError: jest.fn(),
    };
  });

  afterAll(async () => {
    // Close mongoose connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);
      (UserModel.create as jest.Mock).mockResolvedValue({ _id: '1', email: 'test@example.com' });
      (serializeUser as jest.Mock).mockReturnValue({
        data: { _id: '1', email: 'test@example.com' },
      });

      mockRequest.body = { email: 'test@example.com', password: 'password' };

      await register(mockRequest as unknown as Request, mockResponse as unknown as Response);

      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(UserModel.create).toHaveBeenCalledWith(mockRequest.body);
      expect(serializeUser).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({ data: { _id: '1', email: 'test@example.com' } });
    });

    it('should not register if user exists', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue({ _id: '1', email: 'test@example.com' });

      mockRequest.body = { email: 'test@example.com', password: 'password' };

      await register(mockRequest as unknown as Request, mockResponse as unknown as Response);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(400, [
        {
          detail: 'User already exists',
          status: '400',
          title: 'Bad Request',
        },
      ]);
    });
  });

  describe('login', () => {
    it('should login a user and return a token', async () => {
      const mockUser = {
        _id: '1',
        email: 'test@example.com',
        comparePassword: jest.fn().mockResolvedValue(true),
      };
      (UserModel.findOne as jest.Mock).mockResolvedValue(mockUser);
      (serializeUser as jest.Mock).mockReturnValue({
        data: { _id: '1', email: 'test@example.com' },
      });
      (jwt.sign as jest.Mock).mockReturnValue('mocktoken');

      mockRequest.body = { email: 'test@example.com', password: 'password' };

      await login(mockRequest as unknown as Request, mockResponse as unknown as Response);

      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password');
      expect(jwt.sign).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        token: 'mocktoken',
        user: { data: { _id: '1', email: 'test@example.com' } },
      });
    });

    it('should not login with invalid credentials', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);

      mockRequest.body = { email: 'test@example.com', password: 'wrong' };

      await login(mockRequest as unknown as Request, mockResponse as unknown as Response);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(401, [
        {
          detail: 'Invalid credentials',
          status: '401',
          title: 'Unauthorized',
        },
      ]);
    });
  });

  describe('logout', () => {
    it('should clear the token cookie', async () => {
      await logout(mockRequest as unknown as Request, mockResponse as unknown as Response);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('token');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
    });
  });
});
