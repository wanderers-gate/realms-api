import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Request, Response } from 'express';

const TEST_USER_ID = 'user-id-canvas-ctrl-001';
const TEST_ROOM_ID = 'room-id-canvas-ctrl-001';
const TEST_CANVAS_ID = 'canvas-id-canvas-ctrl-001';

jest.mock('../../db', () => ({
  db: {
    query: {
      rooms: { findFirst: jest.fn() },
      canvases: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
  },
}));

import { db } from '../../db';
import { addCanvasOperation, deleteCanvasOperations, getCanvas } from '../canvas.controller';

const mockRoom = {
  id: TEST_ROOM_ID,
  name: 'Test Room',
  slug: 'test-room',
  createdById: TEST_USER_ID,
  isActive: true,
  allowGuests: true,
};

const mockCanvas = {
  id: TEST_CANVAS_ID,
  roomId: TEST_ROOM_ID,
  createdById: TEST_USER_ID,
  mapUrl: null,
  version: 1,
};

const mockOp = {
  id: 'op-row-id-1',
  canvasId: TEST_CANVAS_ID,
  opId: 'op1',
  type: 'draw',
  tool: 'pen',
  points: [{ x: 10, y: 20 }],
  color: '#000000',
  size: 2,
  userId: TEST_USER_ID,
  timestamp: new Date(),
};

// Makes a where() result that is both directly awaitable and chainable with orderBy()
const makeSelectWhereResult = (data: unknown[]) =>
  Object.assign(Promise.resolve(data), {
    orderBy: jest.fn().mockResolvedValue(data),
  });

const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res as Response);
  res.json = jest.fn().mockReturnValue(res as Response);
  return res as Response & { json: jest.MockedFunction<Response['json']> };
};

const mockRequest = (
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  userId?: string
) => ({ body, params, userId, user: undefined }) as unknown as Request;

beforeEach(() => {
  jest.clearAllMocks();

  (db.query.rooms.findFirst as jest.Mock).mockResolvedValue(mockRoom);
  (db.query.canvases.findFirst as jest.Mock).mockResolvedValue(mockCanvas);

  (db.insert as jest.Mock).mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([mockCanvas]),
    }),
  });

  (db.delete as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
  });

  (db.select as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue(makeSelectWhereResult([])),
    }),
  });
});

describe('Canvas Controller', () => {
  describe('getCanvas', () => {
    it('should return existing canvas with operations for a room', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(makeSelectWhereResult([mockOp])),
        }),
      });

      const req = mockRequest({}, { roomId: TEST_ROOM_ID });
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'canvas',
            attributes: expect.objectContaining({
              roomId: TEST_ROOM_ID,
              operations: expect.arrayContaining([
                expect.objectContaining({ id: 'op1', type: 'draw' }),
              ]),
            }),
          }),
        })
      );
    });

    it('should create empty canvas if none exists', async () => {
      (db.query.canvases.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const req = mockRequest({}, { roomId: TEST_ROOM_ID });
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'canvas',
            attributes: expect.objectContaining({ roomId: TEST_ROOM_ID, operations: [] }),
          }),
        })
      );
      expect(db.insert).toHaveBeenCalled();
    });

    it('should return 404 for non-existent room', async () => {
      (db.query.rooms.findFirst as jest.Mock).mockResolvedValue(null);

      const req = mockRequest({}, { roomId: 'nonexistent-uuid' });
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    });

    it('should return 403 for room that does not allow guests', async () => {
      (db.query.rooms.findFirst as jest.Mock).mockResolvedValue({
        ...mockRoom,
        allowGuests: false,
      });

      const req = mockRequest({}, { roomId: TEST_ROOM_ID });
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errors: [{ status: '403', title: 'Forbidden', detail: 'This room does not allow guests' }],
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
        { roomId: TEST_ROOM_ID },
        TEST_USER_ID
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
                  userId: TEST_USER_ID,
                  id: expect.any(String),
                  timestamp: expect.any(Date),
                }),
              ]),
              count: 1,
            }),
          }),
        })
      );
      expect(db.insert).toHaveBeenCalled();
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
        { roomId: TEST_ROOM_ID }
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 for non-existent room', async () => {
      (db.query.rooms.findFirst as jest.Mock).mockResolvedValue(null);

      const req = mockRequest(
        {
          data: {
            type: 'canvas',
            attributes: {
              operations: [{ type: 'draw', tool: 'pen', points: [], color: '#000000', size: 2 }],
            },
          },
        },
        { roomId: 'nonexistent-uuid' },
        TEST_USER_ID
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for missing operations key', async () => {
      const req = mockRequest(
        { data: { type: 'canvas', attributes: { operations: [] } } },
        { roomId: TEST_ROOM_ID },
        TEST_USER_ID
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid operation data' }],
      });
    });
  });

  describe('deleteCanvasOperations', () => {
    beforeEach(() => {
      (db.delete as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'row-1', opId: 'op-1' }]),
        }),
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(makeSelectWhereResult([{ id: 'op-2' }])),
        }),
      });
    });

    it('should delete specified operations and return counts', async () => {
      const req = mockRequest({ operationIds: ['op-1'] }, { roomId: TEST_ROOM_ID }, TEST_USER_ID);
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: { deletedCount: 1, remainingOperations: 1 } });
    });

    it('should return 401 when not authenticated', async () => {
      const req = mockRequest({ operationIds: ['op-1'] }, { roomId: TEST_ROOM_ID });
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 when room does not exist', async () => {
      (db.query.rooms.findFirst as jest.Mock).mockResolvedValue(null);

      const req = mockRequest(
        { operationIds: ['op-1'] },
        { roomId: 'nonexistent-uuid' },
        TEST_USER_ID
      );
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    });

    it('should return 400 when operationIds is missing', async () => {
      const req = mockRequest({}, { roomId: TEST_ROOM_ID }, TEST_USER_ID);
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          { status: '400', title: 'Bad Request', detail: 'Operation IDs array is required' },
        ],
      });
    });

    it('should return 400 when operationIds is an empty array', async () => {
      const req = mockRequest({ operationIds: [] }, { roomId: TEST_ROOM_ID }, TEST_USER_ID);
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when canvas does not exist for the room', async () => {
      (db.query.canvases.findFirst as jest.Mock).mockResolvedValue(null);

      const req = mockRequest({ operationIds: ['op-1'] }, { roomId: TEST_ROOM_ID }, TEST_USER_ID);
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [
          { status: '404', title: 'Canvas Not Found', detail: 'Canvas not found for this room' },
        ],
      });
    });

    it('should return 0 deletedCount when operationIds do not match any operations', async () => {
      (db.delete as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(makeSelectWhereResult([{ id: 'op-1' }, { id: 'op-2' }])),
        }),
      });

      const req = mockRequest(
        { operationIds: ['nonexistent-id'] },
        { roomId: TEST_ROOM_ID },
        TEST_USER_ID
      );
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: { deletedCount: 0, remainingOperations: 2 } });
    });
  });
});
