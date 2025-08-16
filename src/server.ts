import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server, type Socket } from 'socket.io';
import config from './config/config';
import connectDB from './config/database';
import app from './index';
import { chatService } from './services/chat.service';
import logger from './utils/logger';

// Extend Socket interface to include username
interface AuthenticatedSocket extends Socket {
  username?: string;
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
io.on('connection', (socket: AuthenticatedSocket) => {
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
    if (room) {
      room.users.set(socket.id, {
        id: socket.id,
        username: username,
        joinedAt: new Date(),
      });
    }

    logger.info(`User ${username} (${socket.id}) joined room: ${roomId}`);

    // Load recent messages from database
    const currentRoom = rooms.get(roomId);
    if (currentRoom) {
      try {
        const recentMessages = await chatService.getRecentMessages(roomId, 50);
        currentRoom.messages = recentMessages.map((msg) => ({
          id: msg._id.toString(),
          userId: msg.userId,
          username: msg.username,
          message: msg.message,
          timestamp: msg.timestamp,
        }));
        logger.info(`[CHAT] Loaded ${recentMessages.length} messages for room ${roomId}`);
      } catch (error) {
        logger.error(`[CHAT] Error loading messages for room ${roomId}:`, error);
        currentRoom.messages = [];
      }

      // Send room info to joining user
      socket.emit('room-joined', {
        roomId: roomId,
        users: Array.from(currentRoom.users.values()),
        recentMessages: currentRoom.messages,
      });

      // Notify other users in room
      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        username: username,
      });

      // Send updated user list to all in room
      updateRoomUserList(roomId);
    }
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
        socket.username || 'Unknown User',
        message
      );

      const chatMessage = {
        id: savedMessage._id.toString(),
        userId: socket.id,
        username: socket.username || 'Unknown User',
        message: message,
        timestamp: savedMessage.timestamp,
      };

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
      const chatMessage = {
        id: Date.now(),
        userId: socket.id,
        username: socket.username || 'Unknown User',
        message: message,
        timestamp: new Date(),
      };

      io.to(roomId).emit('new-message', chatMessage);
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
