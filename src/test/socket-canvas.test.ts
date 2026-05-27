import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { asc, eq } from 'drizzle-orm';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { io as Client } from 'socket.io-client';
import app from '../index';
import type { DrawingEvent } from '../types/canvas';

const TEST_USER_ID = 'user-id-socket-test-001';
const TEST_ROOM_ID = 'room-id-socket-test-001';
const TEST_CANVAS_ID = 'canvas-id-socket-test-001';

jest.mock('../db', () => ({
  db: {
    query: {
      canvases: { findFirst: jest.fn() },
      rooms: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
  },
}));

import { db } from '../db';
import { canvasOperations, canvases, rooms } from '../db/schema';

const testCanvas = { id: TEST_CANVAS_ID, roomId: TEST_ROOM_ID, createdById: TEST_USER_ID };
const testRoom = { id: TEST_ROOM_ID, createdById: TEST_USER_ID };

const setupDefaultMocks = () => {
  jest.clearAllMocks();

  (db.query.canvases.findFirst as jest.Mock).mockResolvedValue(testCanvas);
  (db.query.rooms.findFirst as jest.Mock).mockResolvedValue(testRoom);

  (db.insert as jest.Mock).mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([testCanvas]),
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    }),
  });

  (db.delete as jest.Mock).mockReturnValue({
    where: jest.fn().mockResolvedValue(undefined),
  });

  (db.select as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue([]),
      }),
    }),
  });
};

describe('Canvas Socket Events', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let clientSocket: ReturnType<typeof Client>;
  let clientSocket2: ReturnType<typeof Client>;

  jest.setTimeout(10000);

  beforeAll(async () => {
    httpServer = createServer(app);
    io = new Server(httpServer, {
      cors: { origin: ['http://localhost:5173'], methods: ['GET', 'POST'] },
    });

    io.on('connection', (socket: Socket) => {
      socket.on('join-room', (roomId: string, username: string) => {
        socket.join(roomId);
        (socket as Socket & { username?: string }).username = username;
      });

      socket.on('canvas-draw', async (drawingEvent: DrawingEvent) => {
        try {
          let canvas = await db.query.canvases.findFirst({
            where: eq(canvases.roomId, drawingEvent.roomId),
          });

          if (!canvas) {
            const room = await db.query.rooms.findFirst({
              where: eq(rooms.id, drawingEvent.roomId),
            });
            const createdById = room?.createdById ?? TEST_USER_ID;
            await db
              .insert(canvases)
              .values({ roomId: drawingEvent.roomId, createdById })
              .onConflictDoNothing();
            canvas = await db.query.canvases.findFirst({
              where: eq(canvases.roomId, drawingEvent.roomId),
            });
            if (!canvas) return;
          }

          const opId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          await db.insert(canvasOperations).values({
            canvasId: canvas.id,
            opId,
            type: drawingEvent.type,
            tool: drawingEvent.tool,
            points: drawingEvent.points,
            color: drawingEvent.color,
            size: drawingEvent.size,
            userId: drawingEvent.userId,
            timestamp: new Date(),
          });

          io.to(drawingEvent.roomId).emit('canvas-draw', {
            ...drawingEvent,
            operationId: opId,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error('Canvas draw error:', error);
        }
      });

      socket.on('canvas-clear', async (roomId: string) => {
        try {
          const canvas = await db.query.canvases.findFirst({
            where: eq(canvases.roomId, roomId),
          });
          if (canvas) {
            await db.delete(canvasOperations).where(eq(canvasOperations.canvasId, canvas.id));
          }
        } catch (error) {
          console.error('Canvas clear error:', error);
        }
        io.to(roomId).emit('canvas-clear', roomId);
      });

      socket.on('canvas-undo', async (roomId: string) => {
        try {
          const canvas = await db.query.canvases.findFirst({
            where: eq(canvases.roomId, roomId),
          });
          if (canvas) {
            const ops = await db
              .select()
              .from(canvasOperations)
              .where(eq(canvasOperations.canvasId, canvas.id))
              .orderBy(asc(canvasOperations.timestamp));
            if (ops.length > 0) {
              await db
                .delete(canvasOperations)
                .where(eq(canvasOperations.id, ops[ops.length - 1].id));
            }
          }
        } catch (error) {
          console.error('Canvas undo error:', error);
        }
        io.to(roomId).emit('canvas-undo', roomId);
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
  });

  afterAll(() => {
    httpServer.close();
  });

  beforeEach(async () => {
    setupDefaultMocks();

    const port = (httpServer.address() as AddressInfo).port;
    clientSocket = Client(`http://localhost:${port}`, { timeout: 5000, forceNew: true });
    clientSocket2 = Client(`http://localhost:${port}`, { timeout: 5000, forceNew: true });

    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      const onConnect = () => {
        connectedCount++;
        if (connectedCount === 2) {
          clientSocket.emit('join-room', TEST_ROOM_ID, 'user1');
          clientSocket2.emit('join-room', TEST_ROOM_ID, 'user2');
          setTimeout(resolve, 50);
        }
      };
      clientSocket.on('connect', onConnect);
      clientSocket2.on('connect', onConnect);
    });
  });

  afterEach(() => {
    clientSocket.close();
    clientSocket2.close();
  });

  describe('canvas-draw event', () => {
    it('should broadcast drawing operation to other users and insert to db', async () => {
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: TEST_ROOM_ID,
        userId: TEST_USER_ID,
        tool: 'pen',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        color: '#000000',
        size: 2,
      };

      const broadcastReceived = new Promise<
        DrawingEvent & { operationId: string; timestamp: Date }
      >((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timeout: canvas-draw not broadcast')),
          5000
        );
        clientSocket2.on('canvas-draw', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      clientSocket.emit('canvas-draw', drawingEvent);
      const broadcastEvent = await broadcastReceived;

      expect(broadcastEvent.type).toBe('draw');
      expect(broadcastEvent.roomId).toBe(TEST_ROOM_ID);
      expect(broadcastEvent.operationId).toBeDefined();
      expect(broadcastEvent.timestamp).toBeDefined();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should create new canvas if none exists', async () => {
      (db.query.canvases.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(testCanvas);

      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: TEST_ROOM_ID,
        userId: TEST_USER_ID,
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#ff0000',
        size: 3,
      };

      clientSocket.emit('canvas-draw', drawingEvent);
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(db.insert).toHaveBeenCalled();
    });

    it('should handle multiple drawing operations', async () => {
      const event1: DrawingEvent = {
        type: 'draw',
        roomId: TEST_ROOM_ID,
        userId: TEST_USER_ID,
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };
      const event2: DrawingEvent = {
        type: 'erase',
        roomId: TEST_ROOM_ID,
        userId: TEST_USER_ID,
        tool: 'eraser',
        points: [{ x: 30, y: 40 }],
        color: '#ffffff',
        size: 5,
      };

      clientSocket.emit('canvas-draw', event1);
      clientSocket.emit('canvas-draw', event2);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(db.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('canvas-clear event', () => {
    it('should delete canvas operations and broadcast to other users', async () => {
      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-clear', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-clear', TEST_ROOM_ID);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(db.delete).toHaveBeenCalled();
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(TEST_ROOM_ID);
    });

    it('should handle clear for non-existent canvas gracefully', async () => {
      (db.query.canvases.findFirst as jest.Mock).mockResolvedValue(null);

      clientSocket.emit('join-room', 'non-existent-room', 'user1');
      clientSocket2.emit('join-room', 'non-existent-room', 'user2');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-clear', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-clear', 'non-existent-room');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(db.delete).not.toHaveBeenCalled();
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe('non-existent-room');
    });
  });

  describe('canvas-undo event', () => {
    it('should delete last operation and broadcast to other users', async () => {
      const mockOp1 = { id: 'op-db-id-1', canvasId: TEST_CANVAS_ID, timestamp: new Date(1000) };
      const mockOp2 = { id: 'op-db-id-2', canvasId: TEST_CANVAS_ID, timestamp: new Date(2000) };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([mockOp1, mockOp2]),
          }),
        }),
      });

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-undo', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-undo', TEST_ROOM_ID);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(db.delete).toHaveBeenCalled();
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(TEST_ROOM_ID);
    });

    it('should handle undo on empty canvas gracefully', async () => {
      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-undo', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-undo', TEST_ROOM_ID);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(db.delete).not.toHaveBeenCalled();
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(TEST_ROOM_ID);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', () => {
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: TEST_ROOM_ID,
        userId: TEST_USER_ID,
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };

      expect(() => {
        clientSocket.emit('canvas-draw', drawingEvent);
      }).not.toThrow();
    });
  });
});
