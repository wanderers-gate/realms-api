import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server, type Socket } from 'socket.io';
import config from './config/config';
import connectDB from './config/database';
import app from './index';
import { CanvasModel } from './models/canvas-model';
import { RoomModel } from './models/room-model';
import { TokenModel, type Token } from './models/token-model';
import { chatService } from './services/chat.service';
import type { CanvasOperation, DrawingEvent } from './types/canvas';
import { verifyJwt } from './utils/jwt';
import logger from './utils/logger';

declare module 'socket.io' {
  interface Socket {
    username?: string;
    authenticatedUserId?: string;
  }
}

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

async function loadTokens(roomId: string): Promise<Token[]> {
  try {
    const docs = await TokenModel.find({ roomId }).lean();
    return docs.map((t) => ({
      id: t.id,
      roomId: t.roomId,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      color: t.color,
      label: t.label,
      ownerId: t.ownerId,
      imageUrl: t.imageUrl,
    }));
  } catch (error) {
    logger.error(`[TOKEN] Error loading tokens for room ${roomId}:`, error);
    return [];
  }
}

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

const rooms = new Map();
const userRooms = new Map();

let server: ReturnType<typeof httpServer.listen>;

io.on('connection', (socket: Socket) => {
  logger.info(`User connected: ${socket.id}`);

  const cookieHeader = socket.handshake.headers.cookie || '';
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]*)/);
  if (tokenMatch) {
    const decoded = verifyJwt(decodeURIComponent(tokenMatch[1]));
    if (decoded) {
      socket.authenticatedUserId = decoded.userId;
    }
  }

  socket.on('join-room', async (roomId: string, username: string) => {
    const previousRoom = userRooms.get(socket.id);
    if (previousRoom) {
      socket.leave(previousRoom);
      updateRoomUserList(previousRoom);
      socket.to(previousRoom).emit('user-left', { userId: socket.id, username: socket.username });
    }

    socket.join(roomId);
    socket.username = username;
    userRooms.set(socket.id, roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Map(), messages: [] });
    }

    const room = rooms.get(roomId);
    if (!room) {
      logger.error(`[ROOM] Room ${roomId} not found after initialization`);
      return;
    }

    room.users.set(socket.id, {
      id: socket.id,
      authenticatedUserId: socket.authenticatedUserId,
      username,
      joinedAt: new Date(),
    });

    logger.info(`User ${username} (${socket.id}) joined room: ${roomId}`);

    try {
      const recentMessages = await chatService.getRecentMessages(roomId, 50);
      room.messages = recentMessages.map((msg) => ({
        id: msg._id.toString(),
        userId: msg.userId,
        username: msg.username,
        message: msg.message,
        timestamp: msg.timestamp,
      }));
    } catch (error) {
      logger.error(`[CHAT] Error loading messages for room ${roomId}:`, error);
      room.messages = [];
    }

    const [existingCanvas, existingTokens, roomDoc] = await Promise.all([
      loadExistingCanvas(roomId),
      loadTokens(roomId),
      RoomModel.findOne({ roomId }),
    ]);
    const userPermissions = roomDoc?.userPermissions || [];

    socket.emit('room-joined', {
      roomId,
      users: Array.from(room.users.values()),
      recentMessages: room.messages,
      canvasOperations: existingCanvas,
      userPermissions,
      tokens: existingTokens,
    });

    socket.to(roomId).emit('user-joined', { userId: socket.id, username });
    updateRoomUserList(roomId);
  });

  socket.on('send-message', async (message: string) => {
    const roomId = userRooms.get(socket.id);
    if (!roomId) return;

    try {
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

      const room = rooms.get(roomId);
      if (room) {
        room.messages.push(chatMessage);
        if (room.messages.length > 100) {
          room.messages = room.messages.slice(-100);
        }
      }

      io.to(roomId).emit('new-message', chatMessage);

      if (room && room.messages.length % 10 === 0) {
        chatService.cleanupOldMessages(roomId, 1000).catch((error) => {
          logger.error(`[CHAT] Error cleaning up old messages for room ${roomId}:`, error);
        });
      }
    } catch (error) {
      logger.error('[CHAT] Error saving message to database:', error);
      // Still broadcast even if db save fails
      io.to(roomId).emit('new-message', createChatMessage(socket, message));
    }
  });

  socket.on('canvas-draw', async (drawingEvent: DrawingEvent & { id?: string }) => {
    // Always use server-verified userId, not client-provided
    const effectiveUserId = socket.authenticatedUserId || socket.id;
    const operation = createCanvasOperation({ ...drawingEvent, userId: effectiveUserId });

    // Broadcast to all users in the room (except sender) - FAST!
    const broadcastEvent = {
      ...drawingEvent,
      operationId: operation.id,
      timestamp: operation.timestamp,
    };

    socket.to(drawingEvent.roomId).emit('canvas-draw', broadcastEvent);

    // Only save operations that have an ID (completion events, not real-time pen segments)
    if (drawingEvent.id) {
      const existingOps = pendingCanvasOperations.get(drawingEvent.roomId) || [];
      existingOps.push(operation);
      pendingCanvasOperations.set(drawingEvent.roomId, existingOps);

      const existingTimer = canvasSaveTimer.get(drawingEvent.roomId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        canvasSaveTimer.delete(drawingEvent.roomId);
        savePendingOperations(drawingEvent.roomId);
      }, 2000);

      canvasSaveTimer.set(drawingEvent.roomId, timer);
    }
  });

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

  socket.on('canvas-delete', async (data: { roomId: string; operationIds: string[] }) => {
    logger.info(
      `[CANVAS] Received delete event from ${socket.id} in room ${data.roomId} for ${data.operationIds.length} operations`
    );

    try {
      await savePendingOperations(data.roomId);

      const requesterUserId = socket.authenticatedUserId || socket.id;
      const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
      const isRoomCreator =
        socket.authenticatedUserId && roomDoc?.createdBy.toString() === socket.authenticatedUserId;
      const hasModifyPermission = roomDoc?.userPermissions.some(
        (p) => p.userId === requesterUserId && p.canModifyDrawings
      );

      const canvas = await CanvasModel.findOne({ roomId: data.roomId });
      if (canvas) {
        const allowedIds = new Set(
          canvas.operations
            .filter((op) => data.operationIds.includes(op.id))
            .filter((op) => isRoomCreator || hasModifyPermission || op.userId === requesterUserId)
            .map((op) => op.id)
        );

        if (allowedIds.size === 0) return;

        const initialCount = canvas.operations.length;
        canvas.operations = canvas.operations.filter((op) => !allowedIds.has(op.id));
        const deletedCount = initialCount - canvas.operations.length;

        await canvas.save();
        logger.info(`[CANVAS] Deleted ${deletedCount} operations for room ${data.roomId}`);

        socket.to(data.roomId).emit('canvas-delete', {
          roomId: data.roomId,
          operationIds: Array.from(allowedIds),
          deletedCount,
        });
      }
    } catch (error) {
      logger.error(`[CANVAS] Error deleting canvas operations for room ${data.roomId}:`, error);
    }
  });

  socket.on('shape-move', async (data: { roomId: string; operationId: string; dx: number; dy: number }) => {
    try {
      await savePendingOperations(data.roomId);
      const requesterUserId = socket.authenticatedUserId || socket.id;
      const [canvas, roomDoc] = await Promise.all([
        CanvasModel.findOne({ roomId: data.roomId }),
        RoomModel.findOne({ roomId: data.roomId }),
      ]);
      if (!canvas) return;
      const op = canvas.operations.find((o) => o.id === data.operationId);
      if (!op) return;
      const isDM = socket.authenticatedUserId && roomDoc?.createdBy.toString() === socket.authenticatedUserId;
      const hasModifyPermission = roomDoc?.userPermissions.some(
        (p) => p.userId === requesterUserId && p.canModifyDrawings
      );
      if (!isDM && !hasModifyPermission && op.userId !== requesterUserId) return;
      op.points = op.points.map((p) => ({ x: p.x + data.dx, y: p.y + data.dy }));
      await canvas.save();
      socket.to(data.roomId).emit('shape-moved', data);
      logger.info(`[CANVAS] Moved shape ${data.operationId} in room ${data.roomId}`);
    } catch (error) {
      logger.error(`[CANVAS] Error moving shape in room ${data.roomId}:`, error);
    }
  });

  socket.on('grid-settings-update', async (data: { roomId: string; gridSettings: unknown }) => {
    try {
      const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
      if (!roomDoc) return;
      const isDM =
        socket.authenticatedUserId && roomDoc.createdBy.toString() === socket.authenticatedUserId;
      if (!isDM) return;
      socket.to(data.roomId).emit('grid-settings-update', data);
    } catch (error) {
      logger.error(`[GRID] Error broadcasting grid settings for room ${data.roomId}:`, error);
    }
  });

  socket.on(
    'token-add',
    async (data: {
      roomId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      label: string;
    }) => {
      try {
        const ownerId = socket.authenticatedUserId || socket.id;
        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const token: Token = {
          id,
          roomId: data.roomId,
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          color: data.color,
          label: data.label,
          ownerId,
        };
        await TokenModel.create(token);
        io.to(data.roomId).emit('token-added', token);
        logger.info(`[TOKEN] Added token ${id} to room ${data.roomId}`);
      } catch (error) {
        logger.error(`[TOKEN] Error adding token to room ${data.roomId}:`, error);
      }
    }
  );

  socket.on('token-move', async (data: { roomId: string; tokenId: string; x: number; y: number }) => {
    try {
      const requesterId = socket.authenticatedUserId || socket.id;
      const [token, roomDoc] = await Promise.all([
        TokenModel.findOne({ id: data.tokenId, roomId: data.roomId }),
        RoomModel.findOne({ roomId: data.roomId }),
      ]);
      if (!token) return;
      const isDM = socket.authenticatedUserId && roomDoc?.createdBy.toString() === socket.authenticatedUserId;
      if (!isDM && token.ownerId !== requesterId) return;
      await TokenModel.updateOne({ id: data.tokenId }, { x: data.x, y: data.y });
      io.to(data.roomId).emit('token-moved', { tokenId: data.tokenId, x: data.x, y: data.y });
    } catch (error) {
      logger.error(`[TOKEN] Error moving token ${data.tokenId}:`, error);
    }
  });

  socket.on('token-resize', async (data: { roomId: string; tokenId: string; width: number; height: number }) => {
    try {
      const requesterId = socket.authenticatedUserId || socket.id;
      const [token, roomDoc] = await Promise.all([
        TokenModel.findOne({ id: data.tokenId, roomId: data.roomId }),
        RoomModel.findOne({ roomId: data.roomId }),
      ]);
      if (!token) return;
      const isDM = socket.authenticatedUserId && roomDoc?.createdBy.toString() === socket.authenticatedUserId;
      if (!isDM && token.ownerId !== requesterId) return;
      await TokenModel.updateOne({ id: data.tokenId }, { width: data.width, height: data.height });
      io.to(data.roomId).emit('token-resized', { tokenId: data.tokenId, width: data.width, height: data.height });
    } catch (error) {
      logger.error(`[TOKEN] Error resizing token ${data.tokenId}:`, error);
    }
  });

  socket.on('token-scale', async (data: { roomId: string; scale: number }) => {
    try {
      await TokenModel.updateMany(
        { roomId: data.roomId },
        [{ $set: {
          x: { $multiply: ['$x', data.scale] },
          y: { $multiply: ['$y', data.scale] },
          width: { $multiply: ['$width', data.scale] },
          height: { $multiply: ['$height', data.scale] },
        } }]
      );
      socket.to(data.roomId).emit('token-scale', data);
      logger.info(`[TOKEN] Scaled tokens for room ${data.roomId} by ${data.scale}`);
    } catch (error) {
      logger.error(`[TOKEN] Error scaling tokens for room ${data.roomId}:`, error);
    }
  });

  socket.on('token-delete', async (data: { roomId: string; tokenId: string }) => {
    try {
      const requesterId = socket.authenticatedUserId || socket.id;
      const [token, roomDoc] = await Promise.all([
        TokenModel.findOne({ id: data.tokenId, roomId: data.roomId }),
        RoomModel.findOne({ roomId: data.roomId }),
      ]);
      if (!token) return;
      const isDM = socket.authenticatedUserId && roomDoc?.createdBy.toString() === socket.authenticatedUserId;
      if (!isDM && token.ownerId !== requesterId) return;
      await TokenModel.deleteOne({ id: data.tokenId });
      io.to(data.roomId).emit('token-deleted', { tokenId: data.tokenId });
      logger.info(`[TOKEN] Deleted token ${data.tokenId} from room ${data.roomId}`);
    } catch (error) {
      logger.error(`[TOKEN] Error deleting token ${data.tokenId}:`, error);
    }
  });

  socket.on('canvas-scale', async (data: { roomId: string; scaleX: number; scaleY: number }) => {
    try {
      const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
      if (!roomDoc) return;
      const isDM =
        socket.authenticatedUserId && roomDoc.createdBy.toString() === socket.authenticatedUserId;
      if (!isDM) return;

      // Flush any pending operations before scaling so nothing is missed
      await savePendingOperations(data.roomId);

      const canvas = await CanvasModel.findOne({ roomId: data.roomId });
      if (canvas && canvas.operations.length > 0) {
        for (const op of canvas.operations) {
          op.points = op.points.map((p) => ({ x: p.x * data.scaleX, y: p.y * data.scaleY }));
        }
        canvas.markModified('operations');
        await canvas.save();
        logger.info(
          `[CANVAS] Scaled ${canvas.operations.length} operations for room ${data.roomId} by (${data.scaleX}, ${data.scaleY})`
        );
      }

      await TokenModel.updateMany(
        { roomId: data.roomId },
        [{ $set: {
          x: { $multiply: ['$x', data.scaleX] },
          y: { $multiply: ['$y', data.scaleY] },
          width: { $multiply: ['$width', data.scaleX] },
          height: { $multiply: ['$height', data.scaleY] },
        } }]
      );

      // Broadcast to all other clients in the room
      socket.to(data.roomId).emit('canvas-scale', data);
    } catch (error) {
      logger.error(`[CANVAS] Error scaling canvas operations for room ${data.roomId}:`, error);
    }
  });

  // Handle permission updates (DM only)
  socket.on(
    'update-permissions',
    async (data: { roomId: string; targetUserId: string; canModifyDrawings: boolean }) => {
      try {
        const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
        if (!roomDoc) return;

        const isDM =
          socket.authenticatedUserId && roomDoc.createdBy.toString() === socket.authenticatedUserId;
        if (!isDM) {
          logger.warn(`[PERMISSIONS] Unauthorized permission change attempt by ${socket.id}`);
          return;
        }

        const existingIndex = roomDoc.userPermissions.findIndex(
          (p) => p.userId === data.targetUserId
        );
        if (existingIndex >= 0) {
          roomDoc.userPermissions[existingIndex].canModifyDrawings = data.canModifyDrawings;
        } else {
          roomDoc.userPermissions.push({
            userId: data.targetUserId,
            canModifyDrawings: data.canModifyDrawings,
          });
        }
        roomDoc.markModified('userPermissions');

        await roomDoc.save();
        logger.info(
          `[PERMISSIONS] Updated permissions for ${data.targetUserId} in room ${data.roomId}`
        );

        io.to(data.roomId).emit('permissions-updated', {
          targetUserId: data.targetUserId,
          canModifyDrawings: data.canModifyDrawings,
        });
      } catch (error) {
        logger.error(`[PERMISSIONS] Error updating permissions for room ${data.roomId}:`, error);
      }
    }
  );

  socket.on('disconnect', () => {
    const roomId = userRooms.get(socket.id);
    if (roomId) {
      savePendingOperations(roomId);
      const room = rooms.get(roomId);
      if (room) {
        room.users.delete(socket.id);

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
