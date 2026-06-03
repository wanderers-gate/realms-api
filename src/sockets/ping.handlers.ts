import type { Server, Socket } from 'socket.io';
import logger from '../utils/logger';

interface PingEvent {
  roomId: string;
  id: string;
  x: number;
  y: number;
  userId: string;
  username: string;
  color: string;
}

export const registerPingHandlers = (socket: Socket, _io: Server): void => {
  socket.on('player-ping', (data: PingEvent) => {
    const { roomId, id, x, y, userId, color } = data;
    const username = socket.username ?? data.username ?? 'Unknown';
    logger.info(`[PING] ${username} pinged room ${roomId} at (${Math.round(x)}, ${Math.round(y)})`);
    socket.to(roomId).emit('player-ping', { id, x, y, userId, username, color });
  });
};
