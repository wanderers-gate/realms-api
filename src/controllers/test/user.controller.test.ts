import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { UserModel } from '../../models/user-model';
import { serializeUser } from '../../serializers/user.serializer';
import { create, destroy, index, show, update } from '../user.controller';

// Mock dependencies
jest.mock('../../models/user-model');
jest.mock('../../serializers/user.serializer');

describe('User Controller', () => {
  let mockRequest: Request;
  let mockResponse: Response;

  beforeEach(() => {
    mockRequest = {
      params: {},
      body: {},
    } as Request;
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      jsonApiError: jest.fn(),
    } as unknown as Response;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Close mongoose connection if it exists
    if (mongoose.connection?.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe('index', () => {
    it('should return all users', async () => {
      const mockUsers = [{ _id: '1', email: 'test@example.com' }];
      (UserModel.find as jest.Mock).mockResolvedValue(mockUsers);
      (serializeUser as jest.Mock).mockReturnValue({ data: mockUsers });

      await index(mockRequest, mockResponse);

      expect(UserModel.find).toHaveBeenCalled();
      expect(serializeUser).toHaveBeenCalledWith(mockUsers);
      expect(mockResponse.json).toHaveBeenCalledWith({ data: mockUsers });
    });

    it('should handle errors', async () => {
      (UserModel.find as jest.Mock).mockRejectedValue(new Error('Database error'));

      await index(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(500, [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to fetch users',
        },
      ]);
    });
  });

  describe('show', () => {
    it('should return a user by id', async () => {
      const mockUser = { _id: '1', email: 'test@example.com' };
      mockRequest.params.id = '1';
      (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);
      (serializeUser as jest.Mock).mockReturnValue({ data: mockUser });

      await show(mockRequest, mockResponse);

      expect(UserModel.findById).toHaveBeenCalledWith('1');
      expect(serializeUser).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.json).toHaveBeenCalledWith({ data: mockUser });
    });

    it('should return 404 if user not found', async () => {
      mockRequest.params.id = '1';
      (UserModel.findById as jest.Mock).mockResolvedValue(null);

      await show(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(404, [
        {
          status: '404',
          title: 'Not Found',
          detail: 'User not found',
        },
      ]);
    });

    it('should handle errors', async () => {
      mockRequest.params.id = '1';
      (UserModel.findById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await show(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(500, [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to fetch user',
        },
      ]);
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const mockUserData = { email: 'test@example.com' };
      const mockCreatedUser = { _id: '1', ...mockUserData };
      // Simulate middleware behavior: extract attributes from JSON:API format
      mockRequest.body = mockUserData;
      (UserModel.create as jest.Mock).mockResolvedValue(mockCreatedUser);
      (serializeUser as jest.Mock).mockReturnValue({ data: mockCreatedUser });

      await create(mockRequest, mockResponse);

      expect(UserModel.create).toHaveBeenCalledWith(mockUserData);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({ data: mockCreatedUser });
    });

    it('should handle errors', async () => {
      mockRequest.body = {};
      (UserModel.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      await create(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(400, [
        {
          status: '400',
          title: 'Bad Request',
          detail: 'Failed to create user',
        },
      ]);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const mockUserData = { email: 'updated@example.com' };
      const mockUpdatedUser = { _id: '1', ...mockUserData };
      mockRequest.params.id = '1';
      // Simulate middleware behavior: extract attributes from JSON:API format
      mockRequest.body = mockUserData;
      (UserModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedUser);
      (serializeUser as jest.Mock).mockReturnValue({ data: mockUpdatedUser });

      await update(mockRequest, mockResponse);

      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith('1', mockUserData, { new: true });
      expect(mockResponse.json).toHaveBeenCalledWith({ data: mockUpdatedUser });
    });

    it('should return 404 if user not found', async () => {
      mockRequest.params.id = '1';
      mockRequest.body = {};
      (UserModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      await update(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(404, [
        {
          status: '404',
          title: 'Not Found',
          detail: 'User not found',
        },
      ]);
    });

    it('should handle errors', async () => {
      mockRequest.params.id = '1';
      mockRequest.body = {};
      (UserModel.findByIdAndUpdate as jest.Mock).mockRejectedValue(new Error('Database error'));

      await update(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(400, [
        {
          status: '400',
          title: 'Bad Request',
          detail: 'Failed to update user',
        },
      ]);
    });
  });

  describe('destroy', () => {
    it('should delete a user', async () => {
      const mockUser = { _id: '1', email: 'test@example.com' };
      mockRequest.params.id = '1';
      (UserModel.findByIdAndDelete as jest.Mock).mockResolvedValue(mockUser);

      await destroy(mockRequest, mockResponse);

      expect(UserModel.findByIdAndDelete).toHaveBeenCalledWith('1');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      mockRequest.params.id = '1';
      (UserModel.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      await destroy(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(404, [
        {
          status: '404',
          title: 'Not Found',
          detail: 'User not found',
        },
      ]);
    });

    it('should handle errors', async () => {
      mockRequest.params.id = '1';
      (UserModel.findByIdAndDelete as jest.Mock).mockRejectedValue(new Error('Database error'));

      await destroy(mockRequest, mockResponse);

      expect(mockResponse.jsonApiError).toHaveBeenCalledWith(500, [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to delete user',
        },
      ]);
    });
  });
});
