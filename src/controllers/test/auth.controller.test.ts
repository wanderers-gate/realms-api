import request from 'supertest';
import express from 'express';
import { register, login, logout } from '../auth.controller';
import { UserModel } from '../../models/user-model';
import { serializeUser } from '../../serializers/user.serializer';
import jwt from 'jsonwebtoken';
import { jsonApiMiddleware } from '../../middleware/json-api';
import mongoose from 'mongoose';

// Mock dependencies
jest.mock('../../models/user-model');
jest.mock('../../serializers/user.serializer');
jest.mock('jsonwebtoken');

let app: express.Application;
let req: ReturnType<typeof request>;

beforeAll(async () => {
  app = express();
  app.use(jsonApiMiddleware);
  app.use(express.json());
  app.post('/register', register);
  app.post('/login', login);
  app.post('/logout', logout);
  
  // Create a single request instance
  req = request(app);
});

afterAll(async () => {
  // Close mongoose connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  
  // Clear all mocks
  jest.clearAllMocks();
});

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);
      (UserModel.create as jest.Mock).mockResolvedValue({ _id: '1', email: 'test@example.com' });
      (serializeUser as jest.Mock).mockReturnValue({
        data: { _id: '1', email: 'test@example.com' },
      });

      const res = await req
        .post('/register')
        .send({ email: 'test@example.com', password: 'password' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ data: { _id: '1', email: 'test@example.com' } });
    });

    it('should not register if user exists', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue({ _id: '1', email: 'test@example.com' });

      const res = await req
        .post('/register')
        .send({ email: 'test@example.com', password: 'password' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].detail).toBe('User already exists');
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

      const res = await req
        .post('/login')
        .send({ email: 'test@example.com', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('mocktoken');
      expect(res.body.user).toBeDefined();
    });

    it('should not login with invalid credentials', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);

      const res = await req
        .post('/login')
        .send({ email: 'test@example.com', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.errors[0].detail).toBe('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('should clear the token cookie', async () => {
      const res = await req.post('/logout');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
    });
  });
});
