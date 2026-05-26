import type { Server, Socket } from 'socket.io';
import { chatService } from '../services/chat.service';
import logger from '../utils/logger';
import { normalizeDiceRoll, parseAndRoll } from './helpers/dice';
import type { RoomState } from './types';

export function registerChatHandlers(
  socket: Socket,
  io: Server,
  rooms: Map<string, RoomState>,
  userRooms: Map<string, string>
): void {
  socket.on(
    'load-more-messages',
    async ({ before, limit = 50 }: { before: string; limit?: number }) => {
      const roomId = userRooms.get(socket.id);
      if (!roomId) return;

      try {
        const older = await chatService.getMessagesBefore(roomId, before, limit);
        const messages = older.map((msg) => {
          const base = {
            id: msg.id,
            userId: msg.userId,
            username: msg.username,
            message: msg.message,
            timestamp: msg.timestamp,
          };
          if (!msg.diceRoll) return base;
          try {
            return {
              ...base,
              diceRoll: normalizeDiceRoll(msg.diceRoll as Record<string, unknown>),
            };
          } catch {
            return base;
          }
        });
        socket.emit('more-messages', { messages, hasMore: older.length === limit });
      } catch (error) {
        logger.error('[CHAT] Error loading more messages:', error);
        socket.emit('more-messages', { messages: [], hasMore: false });
      }
    }
  );

  socket.on('send-message', async (message: string) => {
    const roomId = userRooms.get(socket.id);
    if (!roomId) return;

    const username = socket.username || 'Unknown User';
    const rollMatch = message.match(/^\/r(?:oll)?\s+(.+)$/i);
    const diceRoll = rollMatch ? parseAndRoll(rollMatch[1]) : null;

    if (rollMatch && !diceRoll) return;

    const displayMessage = diceRoll ? `/roll ${diceRoll.notation}` : message;

    try {
      const savedMessage = await chatService.saveMessage(
        roomId,
        socket.id,
        username,
        displayMessage,
        diceRoll ?? undefined
      );

      const chatMessage = {
        id: savedMessage.id,
        userId: socket.id,
        username,
        message: displayMessage,
        timestamp: savedMessage.timestamp ?? new Date(),
        ...(diceRoll && { diceRoll }),
      };

      const room = rooms.get(roomId);
      if (room) {
        room.messages.push(chatMessage);
        if (room.messages.length > 100) {
          room.messages = room.messages.slice(-100);
        }
      }

      io.to(roomId).emit('new-message', chatMessage);
    } catch (error) {
      logger.error('[CHAT] Error saving message to database:', error);
      io.to(roomId).emit('new-message', {
        id: Date.now().toString(),
        userId: socket.id,
        username,
        message: displayMessage,
        timestamp: new Date(),
        ...(diceRoll && { diceRoll }),
      });
    }
  });
}
