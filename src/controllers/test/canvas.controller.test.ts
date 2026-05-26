import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { Request, Response } from 'express';

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

import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { canvasOperations, canvases, rooms, users } from '../../db/schema';
import { addCanvasOperation, deleteCanvasOperations, getCanvas } from '../canvas.controller';

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

let testUserId: string;
let testRoomId: string;

beforeEach(async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: 'test@example.com',
      password: 'hashed',
      firstName: 'Test',
      lastName: 'User',
    })
    .returning();
  testUserId = user.id;

  const [room] = await db
    .insert(rooms)
    .values({
      name: 'Test Room',
      slug: 'test-room',
      roomCode: 'TST001',
      createdById: testUserId,
      isActive: true,
      allowGuests: true,
    })
    .returning();
  testRoomId = room.id;
});

afterEach(async () => {
  await db.delete(canvasOperations);
  await db.delete(canvases);
  await db.delete(rooms);
  await db.delete(users);
});

describe('Canvas Controller', () => {
  describe('getCanvas', () => {
    it('should return existing canvas for a room', async () => {
      const [canvas] = await db
        .insert(canvases)
        .values({
          roomId: testRoomId,
          createdById: testUserId,
        })
        .returning();

      await db.insert(canvasOperations).values({
        canvasId: canvas.id,
        opId: 'op1',
        type: 'draw',
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
        userId: testUserId,
        timestamp: new Date(),
      });

      const req = mockRequest({}, { roomId: testRoomId });
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'canvas',
            attributes: expect.objectContaining({
              roomId: testRoomId,
              operations: expect.arrayContaining([
                expect.objectContaining({ id: 'op1', type: 'draw' }),
              ]),
            }),
          }),
        })
      );
    });

    it('should create empty canvas if none exists', async () => {
      const req = mockRequest({}, { roomId: testRoomId });
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'canvas',
            attributes: expect.objectContaining({ roomId: testRoomId, operations: [] }),
          }),
        })
      );

      const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, testRoomId) });
      expect(canvas).toBeTruthy();
    });

    it('should return 404 for non-existent room', async () => {
      const req = mockRequest({}, { roomId: 'nonexistent-uuid' });
      const res = mockResponse();

      await getCanvas(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    });

    it('should return 403 for room that does not allow guests', async () => {
      const [privateRoom] = await db
        .insert(rooms)
        .values({
          name: 'Private Room',
          slug: 'private-room',
          roomCode: 'PRV001',
          createdById: testUserId,
          isActive: true,
          allowGuests: false,
        })
        .returning();

      const req = mockRequest({}, { roomId: privateRoom.id });
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
        { roomId: testRoomId },
        testUserId
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
                  userId: testUserId,
                  id: expect.any(String),
                  timestamp: expect.any(Date),
                }),
              ]),
              count: 1,
            }),
          }),
        })
      );

      const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, testRoomId) });
      expect(canvas).toBeTruthy();
      if (!canvas) return;
      const ops = await db
        .select()
        .from(canvasOperations)
        .where(eq(canvasOperations.canvasId, canvas.id));
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('draw');
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
        { roomId: testRoomId }
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
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
        { roomId: 'nonexistent-uuid' },
        testUserId
      );
      const res = mockResponse();

      await addCanvasOperation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for missing operations key', async () => {
      const req = mockRequest(
        { data: { type: 'canvas', attributes: { operations: [] } } },
        { roomId: testRoomId },
        testUserId
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
    let canvasId: string;

    beforeEach(async () => {
      const [canvas] = await db
        .insert(canvases)
        .values({
          roomId: testRoomId,
          createdById: testUserId,
        })
        .returning();
      canvasId = canvas.id;

      await db.insert(canvasOperations).values([
        {
          canvasId,
          opId: 'op-1',
          type: 'draw',
          tool: 'pen',
          points: [{ x: 0, y: 0 }],
          color: '#000000',
          size: 2,
          userId: testUserId,
          timestamp: new Date(),
        },
        {
          canvasId,
          opId: 'op-2',
          type: 'draw',
          tool: 'pen',
          points: [{ x: 10, y: 10 }],
          color: '#ff0000',
          size: 3,
          userId: testUserId,
          timestamp: new Date(),
        },
      ]);
    });

    it('should delete specified operations and return counts', async () => {
      const req = mockRequest({ operationIds: ['op-1'] }, { roomId: testRoomId }, testUserId);
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: { deletedCount: 1, remainingOperations: 1 } });

      const remaining = await db
        .select()
        .from(canvasOperations)
        .where(eq(canvasOperations.canvasId, canvasId));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].opId).toBe('op-2');
    });

    it('should return 401 when not authenticated', async () => {
      const req = mockRequest({ operationIds: ['op-1'] }, { roomId: testRoomId });
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 when room does not exist', async () => {
      const req = mockRequest(
        { operationIds: ['op-1'] },
        { roomId: 'nonexistent-uuid' },
        testUserId
      );
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    });

    it('should return 400 when operationIds is missing', async () => {
      const req = mockRequest({}, { roomId: testRoomId }, testUserId);
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
      const req = mockRequest({ operationIds: [] }, { roomId: testRoomId }, testUserId);
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when canvas does not exist for the room', async () => {
      await db.delete(canvasOperations);
      await db.delete(canvases);

      const req = mockRequest({ operationIds: ['op-1'] }, { roomId: testRoomId }, testUserId);
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
      const req = mockRequest(
        { operationIds: ['nonexistent-id'] },
        { roomId: testRoomId },
        testUserId
      );
      const res = mockResponse();

      await deleteCanvasOperations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: { deletedCount: 0, remainingOperations: 2 } });
    });
  });
});
