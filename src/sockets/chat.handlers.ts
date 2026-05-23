import type { Server, Socket } from 'socket.io';
import { chatService } from '../services/chat.service';
import logger from '../utils/logger';
import { parseAndRoll } from './helpers/dice';
import type { RoomState } from './types';

export function registerChatHandlers(
  socket: Socket,
  io: Server,
  rooms: Map<string, RoomState>,
  userRooms: Map<string, string>
): void {
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
        id: savedMessage._id.toString(),
        userId: socket.id,
        username,
        message: displayMessage,
        timestamp: savedMessage.timestamp,
        ...(diceRoll && { diceRoll }),
      };

      const room = rooms.get(roomId);
      if (room) {
        room.messages.push(chatMessage);
        if (room.messages.length > 100) {
          room.messages = room.messages.slice(-100);
        }
        if (room.messages.length % 10 === 0) {
          chatService.cleanupOldMessages(roomId, 1000).catch((error) => {
            logger.error(`[CHAT] Error cleaning up old messages for room ${roomId}:`, error);
          });
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
