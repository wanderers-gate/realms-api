import { createServer } from 'node:http';
import { and, eq } from 'drizzle-orm';
import { Server, type Socket } from 'socket.io';
import config from './config/config';
import runMigrations from './config/database';
import { db } from './db';
import { rooms as roomsTable, userPermissions } from './db/schema';
import app from './index';
import { chatService } from './services/chat.service';
import {
  loadExistingCanvas,
  registerCanvasHandlers,
  savePendingOperations,
} from './sockets/canvas.handlers';
import { registerChatHandlers } from './sockets/chat.handlers';
import {
  loadInitiativeState,
  registerInitiativeHandlers,
} from './sockets/initiative.handlers';
import { normalizeDiceRoll } from './sockets/helpers/dice';
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
  registerInitiativeHandlers(socket, io);

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

    db.update(roomsTable)
      .set({ currentPlayers: room.users.size, lastActivity: new Date() })
      .where(eq(roomsTable.id, roomId))
      .catch((err) => logger.error(`[ROOM] Failed to update player count for ${roomId}:`, err));

    logger.info(`User ${username} (${socket.id}) joined room: ${roomId}`);

    try {
      const recentMessages = await chatService.getRecentMessages(roomId, 50);
      room.messages = recentMessages.map((msg) => {
        const base = {
          id: msg.id,
          userId: msg.userId,
          username: msg.username,
          message: msg.message,
          timestamp: msg.timestamp ?? new Date(),
        };
        if (!msg.diceRoll) return base;
        try {
          return { ...base, diceRoll: normalizeDiceRoll(msg.diceRoll as Record<string, unknown>) };
        } catch {
          return base;
        }
      });
    } catch (error) {
      logger.error(`[CHAT] Error loading messages for room ${roomId}:`, error);
      room.messages = [];
    }

    const [existingCanvas, existingTokens, roomPerms, initiativeState] = await Promise.all([
      loadExistingCanvas(roomId),
      loadTokens(roomId),
      db.select().from(userPermissions).where(eq(userPermissions.roomId, roomId)),
      loadInitiativeState(roomId),
    ]);

    socket.emit('room-joined', {
      roomId,
      users: Array.from(room.users.values()),
      recentMessages: room.messages,
      canvasOperations: existingCanvas.operations,
      mapUrl: existingCanvas.mapUrl,
      userPermissions: roomPerms,
      tokens: existingTokens,
      initiativeState,
    });

    socket.to(roomId).emit('user-joined', { userId: socket.id, username });
    updateRoomUserList(roomId);
  });

  socket.on(
    'update-permissions',
    async (data: { roomId: string; targetUserId: string; canModifyDrawings: boolean }) => {
      try {
        const room = await db.query.rooms.findFirst({ where: eq(roomsTable.id, data.roomId) });
        if (!room) return;

        const isGM = socket.authenticatedUserId && room.createdById === socket.authenticatedUserId;
        if (!isGM) {
          logger.warn(`[PERMISSIONS] Unauthorized permission change attempt by ${socket.id}`);
          return;
        }

        await db
          .insert(userPermissions)
          .values({
            roomId: data.roomId,
            userId: data.targetUserId,
            canModifyDrawings: data.canModifyDrawings,
          })
          .onConflictDoUpdate({
            target: [userPermissions.roomId, userPermissions.userId],
            set: { canModifyDrawings: data.canModifyDrawings },
          });

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
        db.update(roomsTable)
          .set({ currentPlayers: room.users.size })
          .where(eq(roomsTable.id, roomId))
          .catch((err) => logger.error(`[ROOM] Failed to update player count for ${roomId}:`, err));
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
  runMigrations();
  await db.update(roomsTable).set({ currentPlayers: 0 }).where(eq(roomsTable.isActive, true));
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
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
