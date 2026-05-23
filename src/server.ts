import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server, type Socket } from 'socket.io';
import config from './config/config';
import connectDB from './config/database';
import app from './index';
import { RoomModel } from './models/room-model';
import { chatService } from './services/chat.service';
import {
  loadExistingCanvas,
  registerCanvasHandlers,
  savePendingOperations,
} from './sockets/canvas.handlers';
import { registerChatHandlers } from './sockets/chat.handlers';
import { loadTokens, registerTokenHandlers } from './sockets/token.handlers';
import type { RoomState } from './sockets/types';
import { verifyJwt } from './utils/jwt';
import logger from './utils/logger';

declare module 'socket.io' {
  interface Socket {
    username?: string;
    authenticatedUserId?: string;
  }
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map<string, RoomState>();
const userRooms = new Map<string, string>();

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

  registerCanvasHandlers(socket, io);
  registerTokenHandlers(socket, io);
  registerChatHandlers(socket, io, rooms, userRooms);

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
      socket.to(roomId).emit('user-left', { userId: socket.id, username: socket.username });
    }
    userRooms.delete(socket.id);
    logger.info(`User disconnected: ${socket.id}`);
  });

  function updateRoomUserList(roomId: string): void {
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

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
