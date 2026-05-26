import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const TEST_USER_ID = 'user-id-room-ctrl-001';
const TEST_ROOM_ID = 'room-id-room-ctrl-001';
const TEST_OTHER_USER_ID = 'user-id-room-ctrl-other';

jest.mock('../../helpers/storage', () => ({
  slugify: jest.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
  createRoomDirs: jest.fn(),
  renameRoomDir: jest.fn(),
}));

jest.mock('../../db', () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
      rooms: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
  },
}));

import { db } from '../../db';
import { createRoomDirs } from '../../helpers/storage';
import { createRoom, deleteRoom, getRoom, getRooms, updateRoom } from '../room.controller';

const mockUser = {
  id: TEST_USER_ID,
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRoom = {
  id: TEST_ROOM_ID,
  name: 'Test Room',
  slug: 'test-room',
  description: 'A test room',
  roomCode: 'TST001',
  createdById: TEST_USER_ID,
  isActive: true,
  maxPlayers: 5,
  currentPlayers: 0,
  lastActivity: new Date(),
  isPrivate: false,
  allowGuests: true,
  gridSize: 50,
  gridVisible: true,
  gridType: 'square',
  snapToGrid: false,
  gridOpacity: 0.6,
  canvasWidth: 3000,
  canvasHeight: 2000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Chain for getRooms room list: from().leftJoin().where().orderBy().offset().limit()
// biome-ignore lint/suspicious/noExplicitAny: test mock helper
const makeRoomListChain = (roomsData: any[]) => ({
  from: jest.fn().mockReturnValue({
    leftJoin: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          offset: jest.fn().mockReturnValue({
            limit: (jest.fn() as jest.Mock<() => Promise<unknown>>).mockResolvedValue(roomsData),
          }),
        }),
      }),
    }),
  }),
});

// Chain for getRooms total count: from().where()
const makeCountChain = (total: number) => ({
  from: jest.fn().mockReturnValue({
    where: (jest.fn() as jest.Mock<() => Promise<unknown>>).mockResolvedValue([{ total }]),
  }),
});

// Chain for getRoom single result: from().leftJoin().where().limit()
// biome-ignore lint/suspicious/noExplicitAny: test mock helper
const makeSingleRoomChain = (result: any[]) => ({
  from: jest.fn().mockReturnValue({
    leftJoin: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: (jest.fn() as jest.Mock<() => Promise<unknown>>).mockResolvedValue(result),
      }),
    }),
  }),
});

// Chain for update: set().where() — awaitable directly and with .returning()
// biome-ignore lint/suspicious/noExplicitAny: test mock helper
const makeUpdateChain = (returnedRows: any[]) => ({
  set: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue(
      Object.assign(Promise.resolve(undefined), {
        returning: (jest.fn() as jest.Mock<() => Promise<unknown>>).mockResolvedValue(returnedRows),
      })
    ),
  }),
});

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
) => ({ body, params, query, userId }) as unknown as Request;

beforeEach(() => {
  jest.clearAllMocks();

  (db.query.users.findFirst as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
    mockUser
  );
  (db.query.rooms.findFirst as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
    null
  );

  (db.insert as jest.Mock).mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: (jest.fn() as jest.Mock<() => Promise<unknown>>).mockResolvedValue([mockRoom]),
    }),
  });

  (db.update as jest.Mock).mockReturnValue(makeUpdateChain([mockRoom]));
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
        TEST_USER_ID
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
      (db.query.users.findFirst as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
        undefined
      );

      const req = mockRequest({ attributes: { name: 'Test Room' } }, {}, {}, TEST_OTHER_USER_ID);
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [expect.objectContaining({ status: '404', title: 'User Not Found' })],
      });
    });

    it('should return 400 if room name is missing', async () => {
      const req = mockRequest({ attributes: { description: 'No name' } }, {}, {}, TEST_USER_ID);
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [expect.objectContaining({ status: '400', title: 'Bad Request' })],
      });
    });

    it('should return 409 if room name already exists', async () => {
      // The name-conflict check happens before slug/code generation, so
      // any rooms.findFirst call returns the conflicting room.
      (db.query.rooms.findFirst as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
        mockRoom
      );

      const req = mockRequest({ attributes: { name: 'Test Room' } }, {}, {}, TEST_USER_ID);
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        errors: [expect.objectContaining({ status: '409', title: 'Conflict' })],
      });
    });
  });

  describe('getRooms', () => {
    it('should return all active rooms for authenticated users', async () => {
      const mockRoom2 = { ...mockRoom, id: 'room-id-2', name: 'No Guest Room', allowGuests: false };
      const roomsData = [
        { room: mockRoom, creator: mockUser },
        { room: mockRoom2, creator: mockUser },
      ];
      (db.select as jest.Mock)
        .mockReturnValueOnce(makeRoomListChain(roomsData))
        .mockReturnValueOnce(makeCountChain(2));

      const req = mockRequest({}, {}, {}, TEST_USER_ID);
      const res = mockResponse();

      await getRooms(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.data).toHaveLength(2);
      expect(response.meta.pagination.total).toBe(2);
    });

    it('should return only guest-allowed rooms for unauthenticated users', async () => {
      const roomsData = [{ room: { ...mockRoom, name: 'Public Room' }, creator: mockUser }];
      (db.select as jest.Mock)
        .mockReturnValueOnce(makeRoomListChain(roomsData))
        .mockReturnValueOnce(makeCountChain(1));

      const req = mockRequest();
      const res = mockResponse();

      await getRooms(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].attributes.name).toBe('Public Room');
    });

    it('should include pagination metadata', async () => {
      const mockRoom2 = { ...mockRoom, id: 'room-id-2', name: 'Room 2' };
      const roomsData = [
        { room: mockRoom, creator: mockUser },
        { room: mockRoom2, creator: mockUser },
      ];
      (db.select as jest.Mock)
        .mockReturnValueOnce(makeRoomListChain(roomsData))
        .mockReturnValueOnce(makeCountChain(2));

      const req = mockRequest({}, {}, { page: '1', limit: '10' }, TEST_USER_ID);
      const res = mockResponse();

      await getRooms(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.meta.pagination).toMatchObject({ page: 1, limit: 10 });
    });
  });

  describe('getRoom', () => {
    it('should return a specific room', async () => {
      (db.select as jest.Mock).mockReturnValue(
        makeSingleRoomChain([{ room: mockRoom, creator: mockUser }])
      );

      const req = mockRequest({}, { roomId: TEST_ROOM_ID });
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'room',
            attributes: expect.objectContaining({
              name: 'Test Room',
              roomCode: 'TST001',
            }),
          }),
        })
      );
    });

    it('should return 404 for non-existent room', async () => {
      (db.select as jest.Mock).mockReturnValue(makeSingleRoomChain([]));

      const req = mockRequest({}, { roomId: 'nonexistent-uuid' });
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 for guest-restricted room when unauthenticated', async () => {
      (db.select as jest.Mock).mockReturnValue(
        makeSingleRoomChain([{ room: { ...mockRoom, allowGuests: false }, creator: mockUser }])
      );

      const req = mockRequest({}, { roomId: TEST_ROOM_ID });
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should include creator in response', async () => {
      (db.select as jest.Mock).mockReturnValue(
        makeSingleRoomChain([{ room: mockRoom, creator: mockUser }])
      );

      const req = mockRequest({}, { roomId: TEST_ROOM_ID });
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
    it('should update room name and description', async () => {
      const updatedRoom = { ...mockRoom, name: 'Updated Name', description: 'Updated description' };
      // First findFirst returns existing room (owned by user)
      (db.query.rooms.findFirst as unknown as jest.Mock<() => Promise<unknown>>)
        .mockResolvedValueOnce(mockRoom) // room exists
        .mockResolvedValue(null); // name/slug checks: no conflicts
      (db.update as jest.Mock).mockReturnValue(makeUpdateChain([updatedRoom]));

      const req = mockRequest(
        { attributes: { name: 'Updated Name', description: 'Updated description' } },
        { roomId: TEST_ROOM_ID },
        {},
        TEST_USER_ID
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
      const req = mockRequest({ attributes: { name: 'New Name' } }, { roomId: TEST_ROOM_ID });
      const res = mockResponse();

      await updateRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if user is not the creator', async () => {
      (db.query.rooms.findFirst as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
        mockRoom
      );

      const req = mockRequest(
        { attributes: { name: 'New Name' } },
        { roomId: TEST_ROOM_ID },
        {},
        TEST_OTHER_USER_ID
      );
      const res = mockResponse();

      await updateRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('deleteRoom', () => {
    it('should soft-delete room', async () => {
      (db.query.rooms.findFirst as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
        mockRoom
      );

      const req = mockRequest({}, { roomId: TEST_ROOM_ID }, {}, TEST_USER_ID);
      const res = mockResponse();

      await deleteRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should return 403 if user is not the creator', async () => {
      (db.query.rooms.findFirst as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
        mockRoom
      );

      const req = mockRequest({}, { roomId: TEST_ROOM_ID }, {}, TEST_OTHER_USER_ID);
      const res = mockResponse();

      await deleteRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
