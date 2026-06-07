import { eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db';
import { characterSheets, rooms } from '../db/schema';
import logger from '../utils/logger';

async function isGM(roomId: string, authenticatedUserId: string | undefined): Promise<boolean> {
  if (!authenticatedUserId) return false;
  const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
  return room?.createdById === authenticatedUserId;
}

export function registerSheetHandlers(socket: Socket, _io: Server): void {
  socket.on(
    'sheet-data-updated',
    async (data: { roomId: string; sheetId: string; sheetData: Record<string, unknown> }) => {
      try {
        const sheet = await db.query.characterSheets.findFirst({
          where: eq(characterSheets.id, data.sheetId),
        });
        if (!sheet) return;

        const requesterId = socket.authenticatedUserId || socket.id;
        const gm = await isGM(data.roomId, socket.authenticatedUserId);
        if (sheet.ownerId !== requesterId && !gm) {
          logger.warn(`[SHEETS] Unauthorized sheet-data-updated attempt by ${socket.id}`);
          return;
        }

        await db
          .update(characterSheets)
          .set({ sheetData: data.sheetData })
          .where(eq(characterSheets.id, data.sheetId));

        // socket.to excludes the sender — they already have the update locally
        socket.to(data.roomId).emit('sheet-data-updated', {
          sheetId: data.sheetId,
          sheetData: data.sheetData,
        });

        logger.info(`[SHEETS] sheet-data-updated for sheet ${data.sheetId}`);
      } catch (error) {
        logger.error('[SHEETS] Error handling sheet-data-updated:', error);
      }
    }
  );
}
