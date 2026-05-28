import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import type { User } from '../../types/express';
import type { JsonApiResponse } from '../../types/json-api';

type SelectChain = { from: (_: unknown) => Promise<User[]> };
type InsertChain = { values: (_: unknown) => { returning: () => Promise<User[]> } };
type UpdateChain = {
  set: (_: unknown) => { where: (_: unknown) => { returning: () => Promise<User[]> } };
};
type DeleteChain = { where: (_: unknown) => { returning: () => Promise<User[]> } };

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    query: { users: { findFirst: jest.fn() } },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('argon2', () => ({
  hash: jest.fn(),
  argon2id: 2,
}));

jest.mock('../../serializers/user.serializer', () => ({
  serializeUser: jest.fn(),
  deserializeUser: jest.fn(),
}));

import * as argon2 from 'argon2';
import { db } from '../../db';
import { deserializeUser, serializeUser } from '../../serializers/user.serializer';
import { create, destroy, index, show, update } from '../user.controller';

const createMockResponse = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    jsonApiError: jest.fn().mockReturnThis(),
  }) as unknown as Response;

const mockUser: User = {
  id: 'user-uuid-123',
  username: 'testuser',
  password: 'hashed-password',
  displayName: null,
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSerializedUser: JsonApiResponse = {
  data: { id: 'user-uuid-123', type: 'user', attributes: { username: 'testuser' } },
};

const dbSelect = () => db.select as unknown as jest.Mock<() => SelectChain>;
const dbFindFirst = () =>
  db.query.users.findFirst as unknown as jest.Mock<() => Promise<User | undefined>>;
const dbInsert = () => db.insert as unknown as jest.Mock<() => InsertChain>;
const dbUpdate = () => db.update as unknown as jest.Mock<() => UpdateChain>;
const dbDelete = () => db.delete as unknown as jest.Mock<() => DeleteChain>;

describe('User Controller', () => {
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createMockResponse();
    jest.mocked(serializeUser).mockReturnValue(mockSerializedUser);
    jest.mocked(deserializeUser).mockReturnValue({
      username: 'testuser',
    });

    dbSelect().mockImplementation(() => ({
      from: () => Promise.resolve([mockUser]),
    }));

    dbInsert().mockImplementation(() => ({
      values: () => ({ returning: () => Promise.resolve([mockUser]) }),
    }));

    dbUpdate().mockImplementation(() => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([mockUser]) }),
      }),
    }));

    dbDelete().mockImplementation(() => ({
      where: () => ({ returning: () => Promise.resolve([mockUser]) }),
    }));
  });

  describe('index', () => {
    it('should return all users', async () => {
      await index({} as Request, res);

      expect(serializeUser).toHaveBeenCalledWith([mockUser]);
      expect(res.json).toHaveBeenCalledWith(mockSerializedUser);
    });

    it('should handle errors', async () => {
      dbSelect().mockImplementation(() => ({
        from: () => Promise.reject(new Error('DB error')),
      }));

      await index({} as Request, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(500, [
        expect.objectContaining({ title: 'Internal Server Error' }),
      ]);
    });
  });

  describe('show', () => {
    it('should return a user by id', async () => {
      dbFindFirst().mockResolvedValue(mockUser);
      const req = { params: { id: 'user-uuid-123' } } as unknown as Request;

      await show(req, res);

      expect(serializeUser).toHaveBeenCalledWith(mockUser);
      expect(res.json).toHaveBeenCalledWith(mockSerializedUser);
    });

    it('should return 404 if user not found', async () => {
      dbFindFirst().mockResolvedValue(undefined);
      const req = { params: { id: 'nonexistent-id' } } as unknown as Request;

      await show(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(404, [
        expect.objectContaining({ title: 'Not Found' }),
      ]);
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      jest.mocked(deserializeUser).mockReturnValue({
        username: 'newuser',
        password: 'plaintext',
      });
      jest.mocked(argon2.hash).mockResolvedValue('hashed-password');
      const req = { body: {} } as Request;

      await create(req, res);

      expect(argon2.hash).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockSerializedUser);
    });

    it('should return 400 if required fields are missing', async () => {
      jest.mocked(deserializeUser).mockReturnValue({});
      const req = { body: {} } as Request;

      await create(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(400, [
        expect.objectContaining({ title: 'Bad Request' }),
      ]);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const req = { params: { id: 'user-uuid-123' }, body: {} } as unknown as Request;

      await update(req, res);

      expect(res.json).toHaveBeenCalledWith(mockSerializedUser);
    });

    it('should return 404 if user not found', async () => {
      dbUpdate().mockImplementation(() => ({
        set: () => ({
          where: () => ({ returning: () => Promise.resolve([]) }),
        }),
      }));
      const req = { params: { id: 'nonexistent-id' }, body: {} } as unknown as Request;

      await update(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(404, [
        expect.objectContaining({ title: 'Not Found' }),
      ]);
    });
  });

  describe('destroy', () => {
    it('should delete a user', async () => {
      const req = { params: { id: 'user-uuid-123' } } as unknown as Request;

      await destroy(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      dbDelete().mockImplementation(() => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }));
      const req = { params: { id: 'nonexistent-id' } } as unknown as Request;

      await destroy(req, res);

      expect(res.jsonApiError).toHaveBeenCalledWith(404, [
        expect.objectContaining({ title: 'Not Found' }),
      ]);
    });
  });
});
