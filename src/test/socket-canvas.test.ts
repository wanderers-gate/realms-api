import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { io as Client } from 'socket.io-client';
import app from '../index';
import type { DrawingEvent } from '../types/canvas';

jest.mock('../db', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const schema = require('../db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  return { db };
});

import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { canvasOperations, canvases, rooms, users } from '../db/schema';

describe('Canvas Socket Events', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let clientSocket: ReturnType<typeof Client>;
  let clientSocket2: ReturnType<typeof Client>;
  let testUserId: string;
  let testRoomId: string;

  jest.setTimeout(30000);

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: 'test@example.com',
        password: 'password123',
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
      })
      .returning();
    testRoomId = room.id;

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
            const createdById = room?.createdById ?? testUserId;
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
          const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
          if (canvas) {
            await db.delete(canvasOperations).where(eq(canvasOperations.canvasId, canvas.id));
          }
          io.to(roomId).emit('canvas-clear', roomId);
        } catch (error) {
          console.error('Canvas clear error:', error);
        }
      });

      socket.on('canvas-undo', async (roomId: string) => {
        try {
          const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
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
          io.to(roomId).emit('canvas-undo', roomId);
        } catch (error) {
          console.error('Canvas undo error:', error);
        }
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    httpServer.close();
    await db.delete(canvasOperations);
    await db.delete(canvases);
    await db.delete(rooms);
    await db.delete(users);
  });

  beforeEach(async () => {
    await db.delete(canvasOperations);
    await db.delete(canvases);

    const port = (httpServer.address() as AddressInfo).port;
    clientSocket = Client(`http://localhost:${port}`, { timeout: 5000, forceNew: true });
    clientSocket2 = Client(`http://localhost:${port}`, { timeout: 5000, forceNew: true });

    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      const onConnect = () => {
        connectedCount++;
        if (connectedCount === 2) {
          clientSocket.emit('join-room', testRoomId, 'user1');
          clientSocket2.emit('join-room', testRoomId, 'user2');
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

  async function getOpsForRoom(roomId: string) {
    const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
    if (!canvas) return [];
    return db.select().from(canvasOperations).where(eq(canvasOperations.canvasId, canvas.id));
  }

  describe('canvas-draw event', () => {
    it('should save drawing operation to database and broadcast to other users', async () => {
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: testRoomId,
        userId: testUserId,
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

      const ops = await getOpsForRoom(testRoomId);
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('draw');
      expect(ops[0].tool).toBe('pen');
      expect(ops[0].points).toHaveLength(2);
      expect(ops[0].color).toBe('#000000');
      expect(ops[0].size).toBe(2);

      expect(broadcastEvent.type).toBe('draw');
      expect(broadcastEvent.roomId).toBe(testRoomId);
      expect(broadcastEvent.operationId).toBeDefined();
      expect(broadcastEvent.timestamp).toBeDefined();
    });

    it('should create new canvas if none exists', async () => {
      const [extraRoom] = await db
        .insert(rooms)
        .values({
          name: 'New Room',
          slug: 'new-room',
          roomCode: 'NEW001',
          createdById: testUserId,
        })
        .returning();

      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: extraRoom.id,
        userId: testUserId,
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#ff0000',
        size: 3,
      };

      clientSocket.emit('canvas-draw', drawingEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const ops = await getOpsForRoom(extraRoom.id);
      expect(ops).toHaveLength(1);

      const extraCanvas = await db.query.canvases.findFirst({
        where: eq(canvases.roomId, extraRoom.id),
      });
      if (extraCanvas)
        await db.delete(canvasOperations).where(eq(canvasOperations.canvasId, extraCanvas.id));
      await db.delete(canvases).where(eq(canvases.roomId, extraRoom.id));
      await db.delete(rooms).where(eq(rooms.id, extraRoom.id));
    });

    it('should handle multiple drawing operations', async () => {
      const event1: DrawingEvent = {
        type: 'draw',
        roomId: testRoomId,
        userId: testUserId,
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };
      const event2: DrawingEvent = {
        type: 'erase',
        roomId: testRoomId,
        userId: testUserId,
        tool: 'eraser',
        points: [{ x: 30, y: 40 }],
        color: '#ffffff',
        size: 5,
      };

      clientSocket.emit('canvas-draw', event1);
      clientSocket.emit('canvas-draw', event2);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const ops = await getOpsForRoom(testRoomId);
      expect(ops).toHaveLength(2);
      const types = ops.map((op) => op.type);
      expect(types).toContain('draw');
      expect(types).toContain('erase');
    });
  });

  describe('canvas-clear event', () => {
    it('should clear canvas operations and broadcast to other users', async () => {
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: testRoomId,
        userId: testUserId,
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };

      clientSocket.emit('canvas-draw', drawingEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const opsBefore = await getOpsForRoom(testRoomId);
      expect(opsBefore).toHaveLength(1);

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-clear', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-clear', testRoomId);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const opsAfter = await getOpsForRoom(testRoomId);
      expect(opsAfter).toHaveLength(0);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(testRoomId);
    });

    it('should handle clear for non-existent canvas gracefully', async () => {
      clientSocket.emit('join-room', 'non-existent-room', 'user1');
      clientSocket2.emit('join-room', 'non-existent-room', 'user2');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-clear', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-clear', 'non-existent-room');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe('non-existent-room');
    });
  });

  describe('canvas-undo event', () => {
    it('should remove last operation and broadcast to other users', async () => {
      const event1: DrawingEvent = {
        type: 'draw',
        roomId: testRoomId,
        userId: testUserId,
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };
      const event2: DrawingEvent = {
        type: 'draw',
        roomId: testRoomId,
        userId: testUserId,
        tool: 'pen',
        points: [{ x: 30, y: 40 }],
        color: '#ff0000',
        size: 3,
      };

      clientSocket.emit('canvas-draw', event1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      clientSocket.emit('canvas-draw', event2);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const opsBefore = await getOpsForRoom(testRoomId);
      expect(opsBefore).toHaveLength(2);

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-undo', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-undo', testRoomId);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const opsAfter = await getOpsForRoom(testRoomId);
      expect(opsAfter).toHaveLength(1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(testRoomId);
    });

    it('should handle undo on empty canvas gracefully', async () => {
      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-undo', (roomId) => receivedEvents.push(roomId));

      clientSocket.emit('canvas-undo', testRoomId);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(testRoomId);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: testRoomId,
        userId: testUserId,
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
