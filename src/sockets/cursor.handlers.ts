import type { Server, Socket } from 'socket.io';

interface CursorMoveEvent {
  roomId: string;
  x: number;
  y: number;
  username: string;
  color: string;
}

interface CursorLeaveEvent {
  roomId: string;
}

export const registerCursorHandlers = (socket: Socket, _io: Server): void => {
  socket.on('cursor-move', (data: CursorMoveEvent) => {
    const username = socket.username ?? data.username ?? 'Unknown';
    socket.to(data.roomId).emit('cursor-move', {
      userId: socket.id,
      x: data.x,
      y: data.y,
      username,
      color: data.color,
    });
  });

  socket.on('cursor-leave', (data: CursorLeaveEvent) => {
    socket.to(data.roomId).emit('cursor-leave', { userId: socket.id });
  });
};
