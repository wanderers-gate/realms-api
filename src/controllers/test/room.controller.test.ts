import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { Request, Response } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { RoomModel } from '../../models/room-model';
import { UserModel } from '../../models/user-model';
import { createRoom, deleteRoom, getRoom, getRooms, updateRoom } from '../room.controller';

// Mock the response object
const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res as Response);
  res.json = jest.fn().mockReturnValue(res as Response);
  return res as Response & { json: jest.MockedFunction<Response['json']> };
};

// Mock the request object
const mockRequest = (
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  user: { id: string } | null = null
) => {
  const req: Partial<Request> = {
    body,
    params,
    query,
    userId: user?.id,
    // biome-ignore lint/suspicious/noExplicitAny: This is for test compatibility with middleware expectations
    user: user ? ({ id: user.id } as any) : undefined,
  };
  return req as Request;
};

describe('Room Controller', () => {
  let mongoServer: MongoMemoryServer;
  let testUser: InstanceType<typeof UserModel>;

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
    // Clear collections
    await RoomModel.deleteMany({});
    await UserModel.deleteMany({});

    // Create a test user
    testUser = new UserModel({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
    });
    await testUser.save();
  });

  afterEach(async () => {
    // Clean up
    await RoomModel.deleteMany({});
    await UserModel.deleteMany({});
  });

  describe('createRoom', () => {
    it('should create a room successfully', async () => {
      const req = mockRequest(
        {
          data: {
            type: 'room',
            attributes: {
              name: 'Test Room',
              description: 'A test room',
              maxPlayers: 5,
              settings: {
                isPrivate: false,
                allowGuests: true,
                gridSize: 50,
              },
            },
          },
        },
        {},
        {},
        { id: testUser._id.toString() }
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

      // Verify room was saved to database
      const savedRoom = await RoomModel.findOne({ name: 'Test Room' });
      expect(savedRoom).toBeTruthy();
      expect(savedRoom?.createdBy.toString()).toBe(testUser._id.toString());
    });

    it('should return 401 if user is not authenticated', async () => {
      const req = mockRequest(
        {
          name: 'Test Room',
          description: 'A test room',
        },
        {},
        {},
        null
      );
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to create a room',
          },
        ],
      });
    });

    it('should return 404 if user does not exist', async () => {
      const req = mockRequest(
        {
          name: 'Test Room',
          description: 'A test room',
        },
        {},
        {},
        { id: new Types.ObjectId().toString() }
      );
      const res = mockResponse();

      await createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '404',
            title: 'User Not Found',
            detail: 'User not found',
          },
        ],
      });
    });
  });

  describe('getRooms', () => {
    it('should return all public rooms', async () => {
      // Create some test rooms
      const room1 = new RoomModel({
        name: 'Room 1',
        description: 'First room',
        roomId: 'ABC123',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room1.save();

      const room2 = new RoomModel({
        name: 'Room 2',
        description: 'Second room',
        roomId: 'DEF456',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room2.save();

      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getRooms(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              type: 'room',
              attributes: expect.objectContaining({
                name: 'Room 1',
              }),
            }),
            expect.objectContaining({
              type: 'room',
              attributes: expect.objectContaining({
                name: 'Room 2',
              }),
            }),
          ]),
        })
      );
    });

    it('should filter rooms for unauthenticated users', async () => {
      // Create rooms with different guest settings
      const publicRoom = new RoomModel({
        name: 'Public Room',
        roomId: 'PUB123',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await publicRoom.save();

      const privateRoom = new RoomModel({
        name: 'Private Room',
        roomId: 'PRI456',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: false },
      });
      await privateRoom.save();

      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getRooms(req, res);

      const response = (res.json as jest.MockedFunction<Response['json']>).mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].attributes.name).toBe('Public Room');
    });
  });

  describe('getRoom', () => {
    it('should return a specific room', async () => {
      const room = new RoomModel({
        name: 'Test Room',
        description: 'A test room',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room.save();

      const req = mockRequest({}, { roomId: room.roomId }, {});
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'room',
            attributes: expect.objectContaining({
              name: 'Test Room',
              roomId: room.roomId,
            }),
          }),
        })
      );
    });

    it('should return 404 for non-existent room', async () => {
      const req = mockRequest({}, { roomId: 'NONEXISTENT' }, {});
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
    });

    it('should return 403 for private room when user is not authenticated', async () => {
      const room = new RoomModel({
        name: 'Private Room',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: false },
      });
      await room.save();

      const req = mockRequest({}, { roomId: room.roomId }, {}, null);
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '403',
            title: 'Access Denied',
            detail: 'This room does not allow guest access',
          },
        ],
      });
    });

    it('should include createdBy user data in the response', async () => {
      const room = new RoomModel({
        name: 'Test Room',
        description: 'A test room',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room.save();

      const req = mockRequest({}, { roomId: room.roomId }, {});
      const res = mockResponse();

      await getRoom(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'room',
            attributes: expect.objectContaining({
              name: 'Test Room',
              roomId: room.roomId,
            }),
            relationships: expect.objectContaining({
              createdBy: expect.objectContaining({
                data: expect.objectContaining({
                  id: testUser._id.toString(),
                  type: 'user',
                }),
              }),
            }),
          }),
          included: expect.arrayContaining([
            expect.objectContaining({
              type: 'user',
              id: testUser._id.toString(),
              attributes: expect.objectContaining({
                firstName: 'Test',
                lastName: 'User',
                displayName: 'Test User',
              }),
            }),
          ]),
        })
      );
    });
  });

  describe('updateRoom', () => {
    it('should update room successfully', async () => {
      const room = new RoomModel({
        name: 'Original Name',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room.save();

      const req = mockRequest(
        {
          data: {
            type: 'room',
            attributes: {
              name: 'Updated Name',
              description: 'Updated description',
            },
          },
        },
        { roomId: room.roomId },
        {},
        { id: testUser._id.toString() }
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

    it('should return 403 if user is not the creator', async () => {
      const room = new RoomModel({
        name: 'Test Room',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room.save();

      const req = mockRequest(
        {
          data: {
            type: 'room',
            attributes: {
              name: 'Updated Name',
            },
          },
        },
        { roomId: room.roomId },
        {},
        { id: new Types.ObjectId().toString() }
      );
      const res = mockResponse();

      await updateRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'Only the room creator can update the room',
          },
        ],
      });
    });
  });

  describe('deleteRoom', () => {
    it('should delete room successfully', async () => {
      const room = new RoomModel({
        name: 'Test Room',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room.save();

      const req = mockRequest({}, { roomId: room.roomId }, {}, { id: testUser._id.toString() });
      const res = mockResponse();

      await deleteRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(204);

      // Verify room is soft deleted
      const deletedRoom = await RoomModel.findOne({ roomId: room.roomId });
      expect(deletedRoom?.isActive).toBe(false);
    });

    it('should return 403 if user is not the creator', async () => {
      const room = new RoomModel({
        name: 'Test Room',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room.save();

      const req = mockRequest(
        {},
        { roomId: room.roomId },
        {},
        { id: new Types.ObjectId().toString() }
      );
      const res = mockResponse();

      await deleteRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'Only the room creator can delete the room',
          },
        ],
      });
    });
  });
});
