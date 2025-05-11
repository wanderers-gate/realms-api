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

beforeAll(async () => {
  app = express();
  app.use(jsonApiMiddleware);
  app.use(express.json());
  app.post('/register', register);
  app.post('/login', login);
  app.post('/logout', logout);
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
    it('should register a new user', (done) => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);
      (UserModel.create as jest.Mock).mockResolvedValue({ _id: '1', email: 'test@example.com' });
      (serializeUser as jest.Mock).mockReturnValue({
        data: { _id: '1', email: 'test@example.com' },
      });

      request(app)
        .post('/register')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(201)
        .expect({ data: { _id: '1', email: 'test@example.com' } })
        .end(done);
    });

    it('should not register if user exists', (done) => {
      (UserModel.findOne as jest.Mock).mockResolvedValue({ _id: '1', email: 'test@example.com' });

      request(app)
        .post('/register')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(400)
        .expect((res) => {
          expect(res.body.errors[0].detail).toBe('User already exists');
        })
        .end(done);
    });
  });

  describe('login', () => {
    it('should login a user and return a token', (done) => {
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

      request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(200)
        .expect((res) => {
          expect(res.body.token).toBe('mocktoken');
          expect(res.body.user).toBeDefined();
        })
        .end(done);
    });

    it('should not login with invalid credentials', (done) => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);

      request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'wrong' })
        .expect(401)
        .expect((res) => {
          expect(res.body.errors[0].detail).toBe('Invalid credentials');
        })
        .end(done);
    });
  });

  describe('logout', () => {
    it('should clear the token cookie', (done) => {
      request(app)
        .post('/logout')
        .expect(200)
        .expect({ message: 'Logged out successfully' })
        .end(done);
    });
  });
});
