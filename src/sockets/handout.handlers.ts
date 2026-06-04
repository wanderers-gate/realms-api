import { and, eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db';
import { handoutShares, rooms } from '../db/schema';
import logger from '../utils/logger';

interface HandoutShareEvent {
  roomId: string;
  imageUrl: string;
  filename: string;
  sharedBy: string;
}

export const registerHandoutHandlers = (socket: Socket, io: Server): void => {
  socket.on('handout-share', async (data: HandoutShareEvent) => {
    const sharedBy = socket.username ?? data.sharedBy ?? 'GM';
    io.to(data.roomId).emit('handout-shared', {
      imageUrl: data.imageUrl,
      filename: data.filename,
      sharedBy,
    });

    try {
      const room = await db.query.rooms.findFirst({
        where: eq(rooms.id, data.roomId),
        columns: { id: true },
      });
      if (!room) return;

      await db
        .insert(handoutShares)
        .values({ roomId: data.roomId, imageUrl: data.imageUrl, isShared: true })
        .onConflictDoUpdate({
          target: [handoutShares.roomId, handoutShares.imageUrl],
          set: { isShared: true, updatedAt: new Date() },
        });
    } catch (err) {
      logger.error('[HANDOUT] Failed to persist share status:', err);
    }
  });
};
