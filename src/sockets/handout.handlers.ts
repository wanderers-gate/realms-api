import type { Server, Socket } from 'socket.io';

interface HandoutShareEvent {
  roomId: string;
  imageUrl: string;
  filename: string;
  sharedBy: string;
}

export const registerHandoutHandlers = (socket: Socket, io: Server): void => {
  socket.on('handout-share', (data: HandoutShareEvent) => {
    const sharedBy = socket.username ?? data.sharedBy ?? 'GM';
    io.to(data.roomId).emit('handout-shared', {
      imageUrl: data.imageUrl,
      filename: data.filename,
      sharedBy,
    });
  });
};
