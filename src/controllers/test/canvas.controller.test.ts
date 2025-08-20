import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { Request, Response } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { CanvasModel } from '../../models/canvas-model';
import { RoomModel } from '../../models/room-model';
import { UserModel } from '../../models/user-model';
import { addCanvasOperation, getCanvas } from '../canvas.controller';

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
    user: undefined,
  };
  return req as Request;
};

describe('Canvas Controller', () => {
  let mongoServer: MongoMemoryServer;
  let testUser: InstanceType<typeof UserModel>;
  let testRoom: InstanceType<typeof RoomModel>;

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
    await CanvasModel.deleteMany({});
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

    // Create a test room
    testRoom = new RoomModel({
      name: 'Test Room',
      description: 'A test room',
      createdBy: testUser._id,
      isActive: true,
      settings: { isPrivate: false, allowGuests: true },
    });
    await testRoom.save();
  });

  afterEach(async () => {
    // Clean up
    await CanvasModel.deleteMany({});
    await RoomModel.deleteMany({});
    await UserModel.deleteMany({});
  });

  describe('getCanvas', () => {
    it('should return existing canvas for a room', async () => {
      // Create a canvas with some operations
      const canvas = new CanvasModel({
        roomId: testRoom.roomId,
        operations: [
          {
            id: 'op1',
            type: 'draw',
            tool: 'pen',
            points: [{ x: 10, y: 20 }],
            color: '#000000',
            size: 2,
            timestamp: new Date(),
            userId: testUser._id.toString(),
          },
        ],
        createdBy: testUser._id,
      });
      await canvas.save();

      const req = mockRequest({}, { roomId: testRoom.roomId }, {});
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'canvas',
            attributes: expect.objectContaining({
              roomId: testRoom.roomId,
              operations: expect.arrayContaining([
                expect.objectContaining({
                  id: 'op1',
                  type: 'draw',
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should create empty canvas if none exists', async () => {
      const req = mockRequest({}, { roomId: testRoom.roomId }, {});
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'canvas',
            attributes: expect.objectContaining({
              roomId: testRoom.roomId,
              operations: [],
            }),
          }),
        })
      );

      // Verify canvas was created in database
      const canvas = await CanvasModel.findOne({ roomId: testRoom.roomId });
      expect(canvas).toBeTruthy();
      expect(canvas?.operations).toHaveLength(0);
    });

    it('should return 404 for non-existent room', async () => {
      const req = mockRequest({}, { roomId: 'NONEXISTENT' }, {});
      const res = mockResponse();

      await getCanvas(req, res);

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
      // Create a private room that doesn't allow guests
      const privateRoom = new RoomModel({
        name: 'Private Room',
        createdBy: testUser._id,
        isActive: true,
        settings: { isPrivate: false, allowGuests: false },
      });
      await privateRoom.save();

      const req = mockRequest({}, { roomId: privateRoom.roomId }, {});
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'This room does not allow guests',
          },
        ],
      });
    });
  });

  describe('addCanvasOperation', () => {
    it('should add a drawing operation successfully', async () => {
      const req = mockRequest(
        {
          data: {
            type: 'canvas',
            attributes: {
              operations: [
                {
                  type: 'draw',
                  tool: 'pen',
                  points: [
                    { x: 10, y: 20 },
                    { x: 30, y: 40 },
                  ],
                  color: '#ff0000',
                  size: 3,
                },
              ],
            },
          },
        },
        { roomId: testRoom.roomId },
        {},
        { id: testUser._id.toString() }
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'canvas-operations',
            attributes: expect.objectContaining({
              operations: expect.arrayContaining([
                expect.objectContaining({
                  type: 'draw',
                  tool: 'pen',
                  color: '#ff0000',
                  size: 3,
                  userId: testUser._id.toString(),
                  id: expect.any(String),
                  timestamp: expect.any(Date),
                }),
              ]),
              count: 1,
            }),
          }),
        })
      );

      // Verify operation was saved to database
      const canvas = await CanvasModel.findOne({ roomId: testRoom.roomId });
      expect(canvas).toBeTruthy();
      expect(canvas?.operations).toHaveLength(1);
      expect(canvas?.operations[0].type).toBe('draw');
      expect(canvas?.operations[0].userId).toBe(testUser._id.toString());
    });

    it('should return 401 if user is not authenticated', async () => {
      const req = mockRequest(
        {
          data: {
            type: 'canvas',
            attributes: {
              operations: [{ type: 'draw', tool: 'pen', points: [], color: '#000000', size: 2 }],
            },
          },
        },
        { roomId: testRoom.roomId },
        {}
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to draw',
          },
        ],
      });
    });

    it('should return 404 for non-existent room', async () => {
      const req = mockRequest(
        {
          data: {
            type: 'canvas',
            attributes: {
              operations: [{ type: 'draw', tool: 'pen', points: [], color: '#000000', size: 2 }],
            },
          },
        },
        { roomId: 'NONEXISTENT' },
        {},
        { id: testUser._id.toString() }
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid operation data', async () => {
      const req = mockRequest(
        {
          data: {
            type: 'canvas',
            attributes: {
              operations: [], // Empty operations array
            },
          },
        },
        { roomId: testRoom.roomId },
        {},
        { id: testUser._id.toString() }
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          {
            status: '400',
            title: 'Bad Request',
            detail: 'Invalid operation data',
          },
        ],
      });
    });
  });
});
