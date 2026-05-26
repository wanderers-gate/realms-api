import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../helpers/storage', () => ({
  slugify: jest.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
  createRoomDirs: jest.fn(),
  renameRoomDir: jest.fn(),
}));

jest.mock('../../db', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const schema = require('../../db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../../../drizzle') });
  return { db };
});

import { db } from '../../db';
import { rooms, users } from '../../db/schema';
import { createRoomDirs } from '../../helpers/storage';
import { createRoom, deleteRoom, getRoom, getRooms, updateRoom } from '../room.controller';

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn<(code: number) => Response>().mockReturnValue(res);
  res.json = jest.fn<Response['json']>().mockReturnValue(res);
  return res as Response & {
    status: jest.MockedFunction<Response['status']>;
    json: jest.MockedFunction<Response['json']>;
  };
};

const mockRequest = (
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  userId?: string
) =>
  ({
    body,
    params,
    query,
    userId,
  }) as unknown as Request;

let testUserId: string;

beforeEach(async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: 'test@example.com',
      password: 'hashed-password',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
    })
    .returning();
  testUserId = user.id;
  jest.clearAllMocks();
});

afterEach(async () => {
  await db.delete(rooms);
  await db.delete(users);
});

describe('Room Controller', () => {
  describe('createRoom', () => {
    it('should create a room successfully', async () => {
      const req = mockRequest(
        {
          type: 'room',
          attributes: {
            name: 'Test Room',
            description: 'A test room',
            maxPlayers: 5,
            settings: { isPrivate: false, allowGuests: true, gridSize: 50 },
          },
        },
        {},
        {},
        testUserId
      );
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'room',
            attributes: expect.objectContaining({
              name: 'Test Room',
              description: 'A test room',
              maxPlayers: 5,
            }),
          }),
        })
      );
      expect(createRoomDirs).toHaveBeenCalledWith('test-room');
    });

    it('should return 401 if user is not authenticated', async () => {
      const req = mockRequest({ attributes: { name: 'Test Room' } });
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        errors: [expect.objectContaining({ status: '401', title: 'Unauthorized' })],
      });
    });

    it('should return 404 if user does not exist', async () => {
      const req = mockRequest({ attributes: { name: 'Test Room' } }, {}, {}, 'nonexistent-user-id');
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [expect.objectContaining({ status: '404', title: 'User Not Found' })],
      });
    });

    it('should return 400 if room name is missing', async () => {
      const req = mockRequest({ attributes: { description: 'No name' } }, {}, {}, testUserId);
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [expect.objectContaining({ status: '400', title: 'Bad Request' })],
      });
    });

    it('should return 409 if room name already exists', async () => {
      await db.insert(rooms).values({
        name: 'Duplicate Room',
        slug: 'duplicate-room',
        roomCode: 'DUP001',
        createdById: testUserId,
      });

      const req = mockRequest({ attributes: { name: 'Duplicate Room' } }, {}, {}, testUserId);
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        errors: [expect.objectContaining({ status: '409', title: 'Conflict' })],
      });
    });
  });

  describe('getRooms', () => {
    beforeEach(async () => {
      await db.insert(rooms).values([
        {
          name: 'Public Room',
          slug: 'public-room',
          roomCode: 'PUB001',
          createdById: testUserId,
          isActive: true,
          allowGuests: true,
        },
        {
          name: 'No Guest Room',
          slug: 'no-guest-room',
          roomCode: 'NGR001',
          createdById: testUserId,
          isActive: true,
          allowGuests: false,
        },
      ]);
    });

    it('should return all active rooms for authenticated users', async () => {
      const req = mockRequest({}, {}, {}, testUserId);
      const res = mockResponse();

      await getRooms(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.data).toHaveLength(2);
      expect(response.meta.pagination.total).toBe(2);
    });

    it('should filter out non-guest rooms for unauthenticated users', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await getRooms(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].attributes.name).toBe('Public Room');
    });

    it('should include pagination metadata', async () => {
      const req = mockRequest({}, {}, { page: '1', limit: '10' }, testUserId);
      const res = mockResponse();

      await getRooms(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.meta.pagination).toMatchObject({ page: 1, limit: 10 });
    });
  });

  describe('getRoom', () => {
    let testRoomId: string;
    let testRoomCode: string;

    beforeEach(async () => {
      testRoomCode = 'GET001';
      const [room] = await db.insert(rooms).values({
        name: 'Get Test Room',
        slug: 'get-test-room',
        roomCode: testRoomCode,
        createdById: testUserId,
        isActive: true,
        allowGuests: true,
      }).returning();
      testRoomId = room.id;
    });

    it('should return a specific room', async () => {
      const req = mockRequest({}, { roomId: testRoomId });
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'room',
            attributes: expect.objectContaining({ name: 'Get Test Room', roomCode: testRoomCode }),
          }),
        })
      );
    });

    it('should return 404 for non-existent room', async () => {
      const req = mockRequest({}, { roomId: 'nonexistent-uuid' });
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 for guest-restricted room when unauthenticated', async () => {
      const [privateRoom] = await db.insert(rooms).values({
        name: 'No Guest',
        slug: 'no-guest',
        roomCode: 'NGR002',
        createdById: testUserId,
        isActive: true,
        allowGuests: false,
      }).returning();

      const req = mockRequest({}, { roomId: privateRoom.id });
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should include creator in response', async () => {
      const req = mockRequest({}, { roomId: testRoomId });
      const res = mockResponse();

      await getRoom(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.included).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'user',
            attributes: expect.objectContaining({ firstName: 'Test', lastName: 'User' }),
          }),
        ])
      );
    });
  });

  describe('updateRoom', () => {
    let testRoomId: string;

    beforeEach(async () => {
      const [room] = await db.insert(rooms).values({
        name: 'Original Name',
        slug: 'original-name',
        roomCode: 'UPD001',
        createdById: testUserId,
        isActive: true,
      }).returning();
      testRoomId = room.id;
    });

    it('should update room name and description', async () => {
      const req = mockRequest(
        { attributes: { name: 'Updated Name', description: 'Updated description' } },
        { roomId: testRoomId },
        {},
        testUserId
      );
      const res = mockResponse();

      await updateRoom(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attributes: expect.objectContaining({
              name: 'Updated Name',
              description: 'Updated description',
            }),
          }),
        })
      );
    });

    it('should return 401 if unauthenticated', async () => {
      const req = mockRequest({ attributes: { name: 'New Name' } }, { roomId: testRoomId });
      const res = mockResponse();

      await updateRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if user is not the creator', async () => {
      const [otherUser] = await db
        .insert(users)
        .values({
          email: 'other@example.com',
          password: 'hash',
          firstName: 'Other',
          lastName: 'User',
        })
        .returning();

      const req = mockRequest(
        { attributes: { name: 'New Name' } },
        { roomId: testRoomId },
        {},
        otherUser.id
      );
      const res = mockResponse();

      await updateRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('deleteRoom', () => {
    let testRoomId: string;

    beforeEach(async () => {
      const [room] = await db.insert(rooms).values({
        name: 'Delete Me',
        slug: 'delete-me',
        roomCode: 'DEL001',
        createdById: testUserId,
        isActive: true,
      }).returning();
      testRoomId = room.id;
    });

    it('should soft-delete room', async () => {
      const req = mockRequest({}, { roomId: testRoomId }, {}, testUserId);
      const res = mockResponse();

      await deleteRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should return 403 if user is not the creator', async () => {
      const [otherUser] = await db
        .insert(users)
        .values({
          email: 'other2@example.com',
          password: 'hash',
          firstName: 'Other',
          lastName: 'User',
        })
        .returning();

      const req = mockRequest({}, { roomId: testRoomId }, {}, otherUser.id);
      const res = mockResponse();

      await deleteRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
