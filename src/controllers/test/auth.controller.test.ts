import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import type { User } from '../../types/express';
import type { JsonApiResponse } from '../../types/json-api';

type InsertChain = {
  values: (_: unknown) => { returning: () => Promise<User[]> };
};
type UpdateChain = {
  set: (_: unknown) => { where: (_: unknown) => Promise<void> };
};

jest.mock('../../db', () => ({
  db: {
    query: { users: { findFirst: jest.fn() } },
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
  argon2id: 2,
}));

jest.mock('../../utils/jwt', () => ({
  generateToken: jest.fn(),
}));

jest.mock('../../serializers/user.serializer', () => ({
  serializeUser: jest.fn(),
}));

import * as argon2 from 'argon2';
import { db } from '../../db';
import { serializeUser } from '../../serializers/user.serializer';
import { generateToken } from '../../utils/jwt';
import { authCheck, getCurrentUser, login, logout, register } from '../auth.controller';

const createMockResponse = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    jsonApiError: jest.fn().mockReturnThis(),
  }) as unknown as Response;

const mockUserRecord: User = {
  id: 'user-uuid-123',
  username: 'testuser',
  password: 'hashed-password',
  displayName: null,
  color: '#ff0000',
  role: 'gm',
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSerializedUser: JsonApiResponse = {
  data: { id: 'user-uuid-123', type: 'user', attributes: { email: 'test@example.com' } },
};

const dbFindFirst = () =>
  db.query.users.findFirst as unknown as jest.Mock<() => Promise<User | undefined>>;
const dbInsert = () => db.insert as unknown as jest.Mock<() => InsertChain>;
const dbUpdate = () => db.update as unknown as jest.Mock<() => UpdateChain>;

describe('Auth Controller', () => {
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createMockResponse();
    jest.mocked(generateToken).mockReturnValue('mock-token');
    jest.mocked(serializeUser).mockReturnValue(mockSerializedUser);

    dbInsert().mockImplementation(() => ({
      values: () => ({ returning: () => Promise.resolve([mockUserRecord]) }),
    }));

    dbUpdate().mockImplementation(() => ({
      set: () => ({ where: () => Promise.resolve() }),
    }));
  });

  describe('register', () => {
    const req = {
      body: {
        username: 'testuser',
        password: 'password',
        firstName: 'Test',
        lastName: 'User',
      },
    } as Request;

    it('should register a new user and return 201', async () => {
      dbFindFirst().mockResolvedValue(undefined);
      jest.mocked(argon2.hash).mockResolvedValue('hashed-password');

      await register(req, res);

      expect(res.cookie).toHaveBeenCalledWith('token', 'mock-token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockSerializedUser);
    });

    it('should return 400 if user already exists', async () => {
      dbFindFirst().mockResolvedValue(mockUserRecord);

      await register(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(400, [
        expect.objectContaining({ detail: 'Username already taken' }),
      ]);
    });

    it('should return 400 if required fields are missing', async () => {
      const badReq = { body: { email: 'test@example.com' } } as Request;

      await register(badReq, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(400, [
        expect.objectContaining({ title: 'Bad Request' }),
      ]);
    });
  });

  describe('login', () => {
    const req = {
      body: { username: 'testuser', password: 'password' },
    } as Request;

    it('should login and set cookie', async () => {
      dbFindFirst().mockResolvedValue(mockUserRecord);
      jest.mocked(argon2.verify).mockResolvedValue(true);

      await login(req, res);

      expect(generateToken).toHaveBeenCalledWith('user-uuid-123', 1);
      expect(res.cookie).toHaveBeenCalledWith('token', 'mock-token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 401 if user not found', async () => {
      dbFindFirst().mockResolvedValue(undefined);

      await login(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(401, [
        expect.objectContaining({ detail: 'Invalid credentials' }),
      ]);
    });

    it('should return 401 if password is invalid', async () => {
      dbFindFirst().mockResolvedValue(mockUserRecord);
      jest.mocked(argon2.verify).mockResolvedValue(false);

      await login(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(401, [
        expect.objectContaining({ detail: 'Invalid credentials' }),
      ]);
    });

    it('should return 400 if credentials are missing', async () => {
      const badReq = { body: {} } as Request;

      await login(badReq, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(400, [
        expect.objectContaining({ title: 'Bad Request' }),
      ]);
    });
  });

  describe('logout', () => {
    it('should clear token cookie and return 204', () => {
      logout({} as Request, res);

      expect(res.clearCookie).toHaveBeenCalledWith('token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return user data from req.user', async () => {
      const req = {
        user: { ...mockUserRecord, displayName: 'Test User' },
      } as unknown as Request;

      await getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: 'user-uuid-123',
        username: 'testuser',
        displayName: 'Test User',
      });
    });

    it('should fall back to username when displayName is null', async () => {
      const req = { user: mockUserRecord } as unknown as Request;

      await getCurrentUser(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'testuser' }));
    });

    it('should return 401 when no user on request', async () => {
      const req = { user: undefined } as unknown as Request;

      await getCurrentUser(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(401, [
        expect.objectContaining({ detail: 'User not found in request' }),
      ]);
    });
  });

  describe('authCheck', () => {
    it('should return 200', () => {
      authCheck({} as Request, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalled();
    });
  });
});
