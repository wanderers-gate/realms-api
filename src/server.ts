import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server, type Socket } from 'socket.io';
import config from './config/config';
import connectDB from './config/database';
import app from './index';
import { CanvasModel } from './models/canvas-model';
import { RoomModel } from './models/room-model';
import { chatService } from './services/chat.service';
import type { CanvasOperation, DrawingEvent } from './types/canvas';
import logger from './utils/logger';

// Helper functions
const getSocketUsername = (socket: Socket): string => socket.username || 'Unknown User';

const createChatMessage = (
  socket: Socket,
  message: string,
  id: string | number = Date.now(),
  timestamp: Date = new Date()
) => ({
  id: id.toString(),
  userId: socket.id,
  username: getSocketUsername(socket),
  message,
  timestamp,
});

const createCanvasOperation = (drawingEvent: DrawingEvent & { id?: string }): CanvasOperation => ({
  id: drawingEvent.id || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  type: drawingEvent.type,
  tool: drawingEvent.tool,
  points: drawingEvent.points,
  color: drawingEvent.color,
  size: drawingEvent.size,
  timestamp: new Date(),
  userId: drawingEvent.userId,
});

// Batched canvas saves to prevent infinite loops
const pendingCanvasOperations: Map<string, CanvasOperation[]> = new Map();
const canvasSaveTimer: Map<string, NodeJS.Timeout> = new Map();

// Function to save pending operations for a room
async function savePendingOperations(roomId: string) {
  const operations = pendingCanvasOperations.get(roomId);
  if (!operations || operations.length === 0) return;

  try {
    // Get the room to find the creator ObjectId (needed for new canvas)
    const room = await RoomModel.findOne({ roomId });
    if (!room) {
      logger.error(`[CANVAS] Room not found for batch save: ${roomId}`);
      return;
    }

    // Try to add all pending operations at once
    const result = await CanvasModel.findOneAndUpdate(
      { roomId },
      { $push: { operations: { $each: operations } } },
      { new: true }
    );

    if (result) {
      logger.info(`[CANVAS] Batch saved ${operations.length} operations for room ${roomId}`);
    } else {
      // Canvas doesn't exist, create it with all pending operations
      const newCanvas = new CanvasModel({
        roomId,
        operations,
        createdBy: room.createdBy,
      });
      await newCanvas.save();
      logger.info(
        `[CANVAS] Created new canvas with ${operations.length} operations for room ${roomId}`
      );
    }

    // Clear pending operations after successful save
    pendingCanvasOperations.delete(roomId);
  } catch (error) {
    logger.error(`[CANVAS] Error in batch save for room ${roomId}:`, error);
    // Keep the operations for retry, but limit the size to prevent memory issues
    const currentOps = pendingCanvasOperations.get(roomId) || [];
    if (currentOps.length > 1000) {
      // If too many operations failed, keep only the last 100
      pendingCanvasOperations.set(roomId, currentOps.slice(-100));
      logger.warn(
        `[CANVAS] Trimmed pending operations for room ${roomId} due to repeated failures`
      );
    }
  }
}

// Function to load existing canvas for a room
async function loadExistingCanvas(roomId: string) {
  try {
    const canvas = await CanvasModel.findOne({ roomId });

    if (canvas && canvas.operations.length > 0) {
      logger.info(`[CANVAS] Loaded ${canvas.operations.length} operations for room ${roomId}`);
      return canvas.operations;
    }
    return [];
  } catch (error) {
    logger.error(`[CANVAS] Error loading canvas for room ${roomId}:`, error);
    return [];
  }
}

// Create HTTP server and Socket.IO instance
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://realmsapp.io',
      'https://realmsapp.io',
    ],
    methods: ['GET', 'POST'],
  },
});

// Room management
const rooms = new Map();
const userRooms = new Map(); // Track which room each user is in

let server: ReturnType<typeof httpServer.listen>;

// Socket.IO connection handling
io.on('connection', (socket: Socket) => {
  logger.info(`User connected: ${socket.id}`);

  // Join a room
  socket.on('join-room', async (roomId: string, username: string) => {
    // Leave previous room if any
    const previousRoom = userRooms.get(socket.id);
    if (previousRoom) {
      socket.leave(previousRoom);
      updateRoomUserList(previousRoom);
      socket.to(previousRoom).emit('user-left', {
        userId: socket.id,
        username: socket.username,
      });
    }

    // Join new room
    socket.join(roomId);
    socket.username = username;
    userRooms.set(socket.id, roomId);

    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        messages: [],
      });
    }

    // Add user to room
    const room = rooms.get(roomId);
    if (!room) {
      logger.error(`[ROOM] Room ${roomId} not found after initialization`);
      return;
    }

    room.users.set(socket.id, {
      id: socket.id,
      username: username,
      joinedAt: new Date(),
    });

    logger.info(`User ${username} (${socket.id}) joined room: ${roomId}`);

    // Load recent messages from database
    try {
      const recentMessages = await chatService.getRecentMessages(roomId, 50);
      room.messages = recentMessages.map((msg) => ({
        id: msg._id.toString(),
        userId: msg.userId,
        username: msg.username,
        message: msg.message,
        timestamp: msg.timestamp,
      }));
      logger.info(`[CHAT] Loaded ${recentMessages.length} messages for room ${roomId}`);
    } catch (error) {
      logger.error(`[CHAT] Error loading messages for room ${roomId}:`, error);
      room.messages = [];
    }

    // Load existing canvas data
    const existingCanvas = await loadExistingCanvas(roomId);

    // Send room info to joining user
    socket.emit('room-joined', {
      roomId: roomId,
      users: Array.from(room.users.values()),
      recentMessages: room.messages,
      canvasOperations: existingCanvas, // Include existing canvas data
    });

    // Notify other users in room
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      username: username,
    });

    // Send updated user list to all in room
    updateRoomUserList(roomId);
  });

  // Handle chat messages
  socket.on('send-message', async (message: string) => {
    logger.info(`[CHAT] Received message from ${socket.id}: "${message}"`);

    const roomId = userRooms.get(socket.id);
    if (!roomId) {
      logger.warn(`[CHAT] No room found for socket ${socket.id}`);
      return;
    }

    try {
      // Save message to database
      const savedMessage = await chatService.saveMessage(
        roomId,
        socket.id,
        getSocketUsername(socket),
        message
      );

      const chatMessage = createChatMessage(
        socket,
        message,
        savedMessage._id.toString(),
        savedMessage.timestamp
      );

      logger.info('[CHAT] Saved message to database:', chatMessage);

      // Store message in room (for immediate access)
      const room = rooms.get(roomId);
      if (room) {
        room.messages.push(chatMessage);
        // Keep only last 100 messages in memory
        if (room.messages.length > 100) {
          room.messages = room.messages.slice(-100);
        }
        logger.info(
          `[CHAT] Stored message in room ${roomId}, total messages: ${room.messages.length}`
        );
      } else {
        logger.warn(`[CHAT] Room ${roomId} not found when storing message`);
      }

      // Broadcast to all users in room
      logger.info(`[CHAT] Broadcasting message to room ${roomId}:`, chatMessage);
      io.to(roomId).emit('new-message', chatMessage);
      logger.info('[CHAT] Message broadcast complete');

      // Clean up old messages periodically (every 10 messages)
      if (room && room.messages.length % 10 === 0) {
        chatService.cleanupOldMessages(roomId, 1000).catch((error) => {
          logger.error(`[CHAT] Error cleaning up old messages for room ${roomId}:`, error);
        });
      }
    } catch (error) {
      logger.error('[CHAT] Error saving message to database:', error);
      // Still broadcast the message even if database save fails
      const chatMessage = createChatMessage(socket, message);

      io.to(roomId).emit('new-message', chatMessage);
    }
  });

  // Handle canvas drawing events
  socket.on('canvas-draw', async (drawingEvent: DrawingEvent & { id?: string }) => {
    // Broadcast immediately for real-time experience
    const operation = createCanvasOperation(drawingEvent);

    // Broadcast to all users in the room (except sender) - FAST!
    const broadcastEvent = {
      ...drawingEvent,
      operationId: operation.id,
      timestamp: operation.timestamp,
    };

    socket.to(drawingEvent.roomId).emit('canvas-draw', broadcastEvent);

    // Only save operations that have an ID (completion events, not real-time pen segments)
    if (drawingEvent.id) {
      // Add operation to pending batch for this room
      const existingOps = pendingCanvasOperations.get(drawingEvent.roomId) || [];
      existingOps.push(operation);
      pendingCanvasOperations.set(drawingEvent.roomId, existingOps);

      // Clear existing timer for this room
      const existingTimer = canvasSaveTimer.get(drawingEvent.roomId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set a new timer to save in 2 seconds (batching rapid operations)
      const timer = setTimeout(() => {
        canvasSaveTimer.delete(drawingEvent.roomId);
        savePendingOperations(drawingEvent.roomId);
      }, 2000);

      canvasSaveTimer.set(drawingEvent.roomId, timer);
    }
  });

  // Handle canvas undo events
  socket.on('canvas-undo', async (roomId: string) => {
    logger.info(`[CANVAS] Received undo event from ${socket.id} in room ${roomId}`);

    try {
      const canvas = await CanvasModel.findOne({ roomId });
      if (canvas && canvas.operations.length > 0) {
        canvas.operations.pop(); // Remove last operation
        await canvas.save();
        logger.info(`[CANVAS] Undid last operation for room ${roomId}`);
      }

      // Broadcast undo event to all users in the room (except sender)
      socket.to(roomId).emit('canvas-undo', roomId);
    } catch (error) {
      logger.error(`[CANVAS] Error undoing operation for room ${roomId}:`, error);
    }
  });

  // Handle canvas operation deletion events
  socket.on('canvas-delete', async (data: { roomId: string; operationIds: string[] }) => {
    logger.info(
      `[CANVAS] Received delete event from ${socket.id} in room ${data.roomId} for ${data.operationIds.length} operations`
    );

    try {
      // First, save any pending operations for this room to ensure they're in the database
      await savePendingOperations(data.roomId);

      const canvas = await CanvasModel.findOne({ roomId: data.roomId });
      if (canvas) {
        // Filter out operations with the specified IDs
        const initialCount = canvas.operations.length;
        canvas.operations = canvas.operations.filter((op) => !data.operationIds.includes(op.id));
        const deletedCount = initialCount - canvas.operations.length;

        await canvas.save();
        logger.info(`[CANVAS] Deleted ${deletedCount} operations for room ${data.roomId}`);

        // Broadcast deletion event to all users in the room (except sender)
        socket.to(data.roomId).emit('canvas-delete', {
          roomId: data.roomId,
          operationIds: data.operationIds,
          deletedCount,
        });
      }
    } catch (error) {
      logger.error(`[CANVAS] Error deleting canvas operations for room ${data.roomId}:`, error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const roomId = userRooms.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.users.delete(socket.id);

        // Clean up empty rooms
        if (room.users.size === 0) {
          rooms.delete(roomId);
          logger.info(`Room ${roomId} deleted (empty)`);
        } else {
          updateRoomUserList(roomId);
        }
      }

      socket.to(roomId).emit('user-left', {
        userId: socket.id,
        username: socket.username,
      });
    }

    userRooms.delete(socket.id);
    logger.info(`User disconnected: ${socket.id}`);
  });

  // Function to update user list for a room
  function updateRoomUserList(roomId: string) {
    const room = rooms.get(roomId);
    if (room) {
      io.to(roomId).emit('user-list-updated', Array.from(room.users.values()));
    }
  }
});

const startServer = async (): Promise<void> => {
  await connectDB();
  server = httpServer.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port}`);
    logger.info('Socket.IO server initialized');
  });
};

const shutdown = async (): Promise<void> => {
  logger.info('Shutting down server...');
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        logger.info('Server closed');
        resolve();
      });
    });
  }
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
  process.exit(0);
};

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
