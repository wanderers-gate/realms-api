import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import { db } from '../db';
import { characterSheets, rooms } from '../db/schema';
import { sendError } from '../helpers/response';
import logger from '../utils/logger';

const isGM = async (roomId: string, userId: string): Promise<boolean> => {
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, roomId),
    columns: { createdById: true },
  });
  return room?.createdById === userId;
};

export const createSheet = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return sendError(res, 401, 'Unauthorized', 'Authentication required');
    const { roomId, systemId, name, isNpc, sheetData } = req.body;

    if (!roomId || !systemId || !name) {
      return sendError(res, 400, 'Bad Request', 'roomId, systemId, and name are required');
    }

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) return sendError(res, 404, 'Not Found', 'Room not found');

    const [sheet] = await db
      .insert(characterSheets)
      .values({
        roomId,
        ownerId: userId,
        systemId,
        name,
        isNpc: isNpc ?? false,
        sheetData: sheetData ?? {},
      })
      .returning();

    logger.info(`[SHEETS] Created sheet ${sheet.id} in room ${roomId}`);

    const io = req.app.get('io') as Server | undefined;
    io?.to(roomId).emit('sheet-created', { sheet });

    return res.status(201).json({ data: sheet });
  } catch (error) {
    logger.error('Error creating character sheet:', error);
    return sendError(res, 500, 'Internal Server Error', 'Failed to create character sheet');
  }
};

export const getRoomSheets = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const sheets = await db
      .select()
      .from(characterSheets)
      .where(eq(characterSheets.roomId, roomId));
    return res.json({ data: sheets });
  } catch (error) {
    logger.error('Error fetching character sheets:', error);
    return sendError(res, 500, 'Internal Server Error', 'Failed to fetch character sheets');
  }
};

export const getSheet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sheet = await db.query.characterSheets.findFirst({
      where: eq(characterSheets.id, id),
    });
    if (!sheet) return sendError(res, 404, 'Not Found', 'Character sheet not found');
    return res.json({ data: sheet });
  } catch (error) {
    logger.error('Error fetching character sheet:', error);
    return sendError(res, 500, 'Internal Server Error', 'Failed to fetch character sheet');
  }
};

export const updateSheet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    if (!userId) return sendError(res, 401, 'Unauthorized', 'Authentication required');

    const sheet = await db.query.characterSheets.findFirst({
      where: eq(characterSheets.id, id),
    });
    if (!sheet) return sendError(res, 404, 'Not Found', 'Character sheet not found');

    const gm = await isGM(sheet.roomId, userId);
    if (sheet.ownerId !== userId && !gm) {
      return sendError(res, 403, 'Forbidden', 'Only the owner or GM can update this sheet');
    }

    const updates: Partial<typeof characterSheets.$inferInsert> = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.portraitUrl !== undefined) updates.portraitUrl = req.body.portraitUrl;
    if (req.body.sheetData !== undefined) updates.sheetData = req.body.sheetData;
    if (req.body.tokenId !== undefined) updates.tokenId = req.body.tokenId;

    const [updated] = await db
      .update(characterSheets)
      .set(updates)
      .where(eq(characterSheets.id, id))
      .returning();

    logger.info(`[SHEETS] Updated sheet ${id}`);
    return res.json({ data: updated });
  } catch (error) {
    logger.error('Error updating character sheet:', error);
    return sendError(res, 500, 'Internal Server Error', 'Failed to update character sheet');
  }
};

export const deleteSheet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    if (!userId) return sendError(res, 401, 'Unauthorized', 'Authentication required');

    const sheet = await db.query.characterSheets.findFirst({
      where: eq(characterSheets.id, id),
    });
    if (!sheet) return sendError(res, 404, 'Not Found', 'Character sheet not found');

    const gm = await isGM(sheet.roomId, userId);
    if (sheet.ownerId !== userId && !gm) {
      return sendError(res, 403, 'Forbidden', 'Only the owner or GM can delete this sheet');
    }

    const roomId = sheet.roomId;
    await db.delete(characterSheets).where(eq(characterSheets.id, id));

    logger.info(`[SHEETS] Deleted sheet ${id}`);

    const io = req.app.get('io') as Server | undefined;
    io?.to(roomId).emit('sheet-deleted', { sheetId: id });

    return res.status(204).send();
  } catch (error) {
    logger.error('Error deleting character sheet:', error);
    return sendError(res, 500, 'Internal Server Error', 'Failed to delete character sheet');
  }
};
