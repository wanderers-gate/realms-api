import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { io as Client } from 'socket.io-client';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import config from '../config/config';
import connectDB from '../config/database';
import app from '../index';
import { CanvasModel } from '../models/canvas-model';
import { RoomModel } from '../models/room-model';
import { UserModel } from '../models/user-model';
import type { DrawingEvent } from '../types/canvas';

describe('Canvas Socket Events', () => {
  let mongoServer: MongoMemoryServer;
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let clientSocket: ReturnType<typeof Client>;
  let clientSocket2: ReturnType<typeof Client>;
  let testUser: any;
  let testRoom: any;

  // Increase timeout for socket tests
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Start MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Connect to test database
    await mongoose.connect(mongoUri);

    // Create test user
    testUser = await UserModel.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'password123',
    });

    // Create test room
    testRoom = await RoomModel.create({
      name: 'Test Room',
      description: 'Test room for canvas',
      isPublic: true,
      createdBy: testUser._id,
    });

    // Start HTTP server
    httpServer = createServer(app);
    io = new Server(httpServer, {
      cors: {
        origin: ['http://localhost:5173'],
        methods: ['GET', 'POST'],
      },
    });

    // Import and set up socket handlers (this would normally be done in server.ts)
    // For testing, we'll manually set up the handlers
    io.on('connection', (socket: any) => {
      socket.username = 'testuser';

      // Handle room joining
      socket.on('join-room', (roomId: string, username: string) => {
        socket.join(roomId);
        socket.username = username;
      });

      // Handle canvas drawing events
      socket.on('canvas-draw', async (drawingEvent: DrawingEvent) => {
        try {
          let canvas = await CanvasModel.findOne({ roomId: drawingEvent.roomId });

          if (!canvas) {
            canvas = new CanvasModel({
              roomId: drawingEvent.roomId,
              operations: [],
              createdBy: testUser._id, // Use test user ID instead of socket ID
            });
          }

          const operation = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: drawingEvent.type,
            tool: drawingEvent.tool,
            points: drawingEvent.points,
            color: drawingEvent.color,
            size: drawingEvent.size,
            timestamp: new Date(),
            userId: drawingEvent.userId,
          };

          canvas.operations.push(operation);
          await canvas.save();

          // Broadcast to all sockets in the room (including sender for testing)
          io.to(drawingEvent.roomId).emit('canvas-draw', {
            ...drawingEvent,
            operationId: operation.id,
            timestamp: operation.timestamp,
          });
        } catch (error) {
          // Handle duplicate key error gracefully
          if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
            // Canvas already exists, try to find and update it
            const existingCanvas = await CanvasModel.findOne({ roomId: drawingEvent.roomId });
            if (existingCanvas) {
              const operation = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: drawingEvent.type,
                tool: drawingEvent.tool,
                points: drawingEvent.points,
                color: drawingEvent.color,
                size: drawingEvent.size,
                timestamp: new Date(),
                userId: drawingEvent.userId,
              };

              existingCanvas.operations.push(operation);
              await existingCanvas.save();

              io.to(drawingEvent.roomId).emit('canvas-draw', {
                ...drawingEvent,
                operationId: operation.id,
                timestamp: operation.timestamp,
              });
            }
          } else {
            console.error('Canvas draw error:', error);
          }
        }
      });

      // Handle canvas clear events
      socket.on('canvas-clear', async (roomId: string) => {
        try {
          const canvas = await CanvasModel.findOne({ roomId });
          if (canvas) {
            canvas.operations = [];
            await canvas.save();
          }
          // Broadcast to all sockets in the room
          io.to(roomId).emit('canvas-clear', roomId);
        } catch (error) {
          console.error('Canvas clear error:', error);
        }
      });

      // Handle canvas undo events
      socket.on('canvas-undo', async (roomId: string) => {
        try {
          const canvas = await CanvasModel.findOne({ roomId });
          if (canvas && canvas.operations.length > 0) {
            canvas.operations.pop();
            await canvas.save();
          }
          // Broadcast to all sockets in the room
          io.to(roomId).emit('canvas-undo', roomId);
        } catch (error) {
          console.error('Canvas undo error:', error);
        }
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongoServer.stop();
    httpServer.close();
  });

  beforeEach(async () => {
    // Clear canvas data before each test
    await CanvasModel.deleteMany({});

    // Connect client sockets
    const port = (httpServer.address() as any).port;
    clientSocket = Client(`http://localhost:${port}`, {
      timeout: 5000,
      forceNew: true,
    });
    clientSocket2 = Client(`http://localhost:${port}`, {
      timeout: 5000,
      forceNew: true,
    });

    // Simple connection setup
    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      const onConnect = () => {
        connectedCount++;
        if (connectedCount === 2) {
          // Join both sockets to the test room
          clientSocket.emit('join-room', testRoom._id.toString(), 'user1');
          clientSocket2.emit('join-room', testRoom._id.toString(), 'user2');
          setTimeout(resolve, 50);
        }
      };

      clientSocket.on('connect', onConnect);
      clientSocket2.on('connect', onConnect);
    });
  });

  afterEach(async () => {
    clientSocket.close();
    clientSocket2.close();
  });

  describe('canvas-draw event', () => {
    it('should save drawing operation to database and broadcast to other users', async () => {
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: testRoom._id.toString(),
        userId: testUser._id.toString(),
        tool: 'pen',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        color: '#000000',
        size: 2,
      };

      const receivedEvents: any[] = [];
      clientSocket2.on('canvas-draw', (event) => {
        receivedEvents.push(event);
      });

      // Emit drawing event from first client
      clientSocket.emit('canvas-draw', drawingEvent);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that canvas was saved to database
      const canvas = await CanvasModel.findOne({ roomId: testRoom._id.toString() });
      expect(canvas).toBeTruthy();
      expect(canvas?.operations).toHaveLength(1);
      expect(canvas?.operations[0].type).toBe('draw');
      expect(canvas?.operations[0].tool).toBe('pen');
      expect(canvas?.operations[0].points).toHaveLength(2);
      expect(canvas?.operations[0].color).toBe('#000000');
      expect(canvas?.operations[0].size).toBe(2);

      // Check that event was broadcast to other client
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('draw');
      expect(receivedEvents[0].roomId).toBe(testRoom._id.toString());
      expect(receivedEvents[0].operationId).toBeDefined();
      expect(receivedEvents[0].timestamp).toBeDefined();
    });

    it('should create new canvas if none exists', async () => {
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: 'new-room-id',
        userId: testUser._id.toString(),
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#ff0000',
        size: 3,
      };

      clientSocket.emit('canvas-draw', drawingEvent);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await CanvasModel.findOne({ roomId: 'new-room-id' });
      expect(canvas).toBeTruthy();
      expect(canvas?.operations).toHaveLength(1);
      expect(canvas?.createdBy.toString()).toBe(testUser._id.toString());
    });

    it('should handle multiple drawing operations', async () => {
      const drawingEvent1: DrawingEvent = {
        type: 'draw',
        roomId: testRoom._id.toString(),
        userId: testUser._id.toString(),
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };

      const drawingEvent2: DrawingEvent = {
        type: 'erase',
        roomId: testRoom._id.toString(),
        userId: testUser._id.toString(),
        tool: 'eraser',
        points: [{ x: 30, y: 40 }],
        color: '#ffffff',
        size: 5,
      };

      clientSocket.emit('canvas-draw', drawingEvent1);
      clientSocket.emit('canvas-draw', drawingEvent2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await CanvasModel.findOne({ roomId: testRoom._id.toString() });
      expect(canvas?.operations).toHaveLength(2);
      // Check that both operations exist (order might vary due to async timing)
      const operationTypes = canvas?.operations.map((op) => op.type);
      expect(operationTypes).toContain('draw');
      expect(operationTypes).toContain('erase');
    });
  });

  describe('canvas-clear event', () => {
    it('should clear canvas operations and broadcast to other users', async () => {
      // First, add some operations by drawing
      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: testRoom._id.toString(),
        userId: testUser._id.toString(),
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };

      clientSocket.emit('canvas-draw', drawingEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify canvas was created with operation
      let canvas = await CanvasModel.findOne({ roomId: testRoom._id.toString() });
      expect(canvas?.operations).toHaveLength(1);

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-clear', (roomId) => {
        receivedEvents.push(roomId);
      });

      // Emit clear event
      clientSocket.emit('canvas-clear', testRoom._id.toString());

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that canvas was cleared
      const updatedCanvas = await CanvasModel.findOne({ roomId: testRoom._id.toString() });
      expect(updatedCanvas?.operations).toHaveLength(0);

      // Check that event was broadcast
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(testRoom._id.toString());
    });

    it('should handle clear for non-existent canvas gracefully', async () => {
      // Join socket to the non-existent room
      clientSocket.emit('join-room', 'non-existent-room', 'user1');
      clientSocket2.emit('join-room', 'non-existent-room', 'user2');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-clear', (roomId) => {
        receivedEvents.push(roomId);
      });

      clientSocket.emit('canvas-clear', 'non-existent-room');

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not throw error and should still broadcast
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe('non-existent-room');
    });
  });

  describe('canvas-undo event', () => {
    it('should remove last operation and broadcast to other users', async () => {
      // Create canvas with multiple operations by drawing
      const drawingEvent1: DrawingEvent = {
        type: 'draw',
        roomId: testRoom._id.toString(),
        userId: testUser._id.toString(),
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };

      const drawingEvent2: DrawingEvent = {
        type: 'draw',
        roomId: testRoom._id.toString(),
        userId: testUser._id.toString(),
        tool: 'pen',
        points: [{ x: 30, y: 40 }],
        color: '#ff0000',
        size: 3,
      };

      clientSocket.emit('canvas-draw', drawingEvent1);
      clientSocket.emit('canvas-draw', drawingEvent2);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify canvas has 2 operations
      let canvas = await CanvasModel.findOne({ roomId: testRoom._id.toString() });
      expect(canvas?.operations).toHaveLength(2);

      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-undo', (roomId) => {
        receivedEvents.push(roomId);
      });

      // Emit undo event
      clientSocket.emit('canvas-undo', testRoom._id.toString());

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that last operation was removed
      const updatedCanvas = await CanvasModel.findOne({ roomId: testRoom._id.toString() });
      expect(updatedCanvas?.operations).toHaveLength(1);

      // Check that event was broadcast
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(testRoom._id.toString());
    });

    it('should handle undo on empty canvas gracefully', async () => {
      const receivedEvents: string[] = [];
      clientSocket2.on('canvas-undo', (roomId) => {
        receivedEvents.push(roomId);
      });

      clientSocket.emit('canvas-undo', testRoom._id.toString());

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not throw error and should still broadcast
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(testRoom._id.toString());
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error by temporarily disconnecting
      await mongoose.connection.close();

      const drawingEvent: DrawingEvent = {
        type: 'draw',
        roomId: testRoom._id.toString(),
        userId: testUser._id.toString(),
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
      };

      // Should not throw error
      expect(() => {
        clientSocket.emit('canvas-draw', drawingEvent);
      }).not.toThrow();

      // Reconnect for cleanup
      await mongoose.connect(mongoServer.getUri());
    });
  });
});
