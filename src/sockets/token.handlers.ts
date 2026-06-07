import { and, eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db';
import { characterSheets, rooms, tokens } from '../db/schema';
import logger from '../utils/logger';
import type { Token } from './types';

async function isGM(roomId: string, authenticatedUserId: string | undefined): Promise<boolean> {
  if (!authenticatedUserId) return false;
  const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
  return room?.createdById === authenticatedUserId;
}

function rowToToken(row: typeof tokens.$inferSelect): Token {
  return {
    id: row.tokenId,
    roomId: row.roomId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    color: row.color,
    label: row.label,
    ownerId: row.ownerId,
    ownerIds: (row.ownerIds as string[]) ?? [row.ownerId],
    imageUrl: row.imageUrl ?? undefined,
    imageOffsetX: row.imageOffsetX,
    imageOffsetY: row.imageOffsetY,
    imageScale: row.imageScale,
    visible: row.visible,
    hp: row.hp,
    maxHp: row.maxHp,
    conditions: (row.conditions as string[]) ?? [],
    initiative: row.initiative,
  };
}

export async function loadTokens(roomId: string): Promise<Token[]> {
  try {
    const rows = await db.select().from(tokens).where(eq(tokens.roomId, roomId));
    return rows.map(rowToToken);
  } catch (error) {
    logger.error(`[TOKEN] Error loading tokens for room ${roomId}:`, error);
    return [];
  }
}

export function registerTokenHandlers(socket: Socket, io: Server): void {
  socket.on(
    'token-add',
    async (data: {
      roomId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      label: string;
      imageUrl?: string;
      imageOffsetX?: number;
      imageOffsetY?: number;
      imageScale?: number;
      ownerIds?: string[];
      visible?: boolean;
      sheetId?: string;
      hp?: number;
      maxHp?: number;
      conditions?: string[];
    }) => {
      try {
        const ownerId = socket.authenticatedUserId || socket.id;
        const ownerIds = data.ownerIds?.length ? data.ownerIds : [ownerId];
        const visible = data.visible ?? true;
        const hp = data.hp ?? 0;
        const maxHp = data.maxHp ?? 0;
        const conditions = data.conditions ?? [];
        const tokenId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

        await db.insert(tokens).values({
          tokenId,
          roomId: data.roomId,
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          color: data.color,
          label: data.label,
          imageUrl: data.imageUrl ?? null,
          imageOffsetX: data.imageOffsetX ?? 0,
          imageOffsetY: data.imageOffsetY ?? 0,
          imageScale: data.imageScale ?? 1,
          ownerId,
          ownerIds,
          visible,
          hp,
          maxHp,
          conditions,
        });

        const token: Token = {
          id: tokenId,
          roomId: data.roomId,
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          color: data.color,
          label: data.label,
          imageUrl: data.imageUrl,
          imageOffsetX: data.imageOffsetX ?? 0,
          imageOffsetY: data.imageOffsetY ?? 0,
          imageScale: data.imageScale ?? 1,
          ownerId,
          ownerIds,
          visible,
          hp,
          maxHp,
          conditions,
          initiative: 0,
        };

        if (data.sheetId) {
          await db
            .update(characterSheets)
            .set({ tokenId })
            .where(eq(characterSheets.id, data.sheetId));
          io.to(data.roomId).emit('sheet-token-linked', { sheetId: data.sheetId, tokenId });
        }

        io.to(data.roomId).emit('token-added', token);
        logger.info(`[TOKEN] Added token ${tokenId} to room ${data.roomId}`);
      } catch (error) {
        logger.error(`[TOKEN] Error adding token to room ${data.roomId}:`, error);
      }
    }
  );

  socket.on(
    'token-move',
    async (data: { roomId: string; tokenId: string; x: number; y: number }) => {
      try {
        const requesterId = socket.authenticatedUserId || socket.id;
        const token = await db.query.tokens.findFirst({
          where: and(eq(tokens.tokenId, data.tokenId), eq(tokens.roomId, data.roomId)),
        });
        if (!token) return;

        const ownerIds = (token.ownerIds as string[]) ?? [token.ownerId];
        if (
          !(await isGM(data.roomId, socket.authenticatedUserId)) &&
          !ownerIds.includes(requesterId)
        )
          return;

        await db
          .update(tokens)
          .set({ x: data.x, y: data.y })
          .where(eq(tokens.tokenId, data.tokenId));
        io.to(data.roomId).emit('token-moved', { tokenId: data.tokenId, x: data.x, y: data.y });
      } catch (error) {
        logger.error(`[TOKEN] Error moving token ${data.tokenId}:`, error);
      }
    }
  );

  socket.on('token-drag', (data: { roomId: string; tokenId: string; x: number; y: number }) => {
    socket.to(data.roomId).emit('token-dragged', { tokenId: data.tokenId, x: data.x, y: data.y });
  });

  socket.on(
    'token-resize',
    async (data: { roomId: string; tokenId: string; width: number; height: number }) => {
      try {
        const requesterId = socket.authenticatedUserId || socket.id;
        const token = await db.query.tokens.findFirst({
          where: and(eq(tokens.tokenId, data.tokenId), eq(tokens.roomId, data.roomId)),
        });
        if (!token) return;

        const ownerIds = (token.ownerIds as string[]) ?? [token.ownerId];
        if (
          !(await isGM(data.roomId, socket.authenticatedUserId)) &&
          !ownerIds.includes(requesterId)
        )
          return;

        await db
          .update(tokens)
          .set({ width: data.width, height: data.height })
          .where(eq(tokens.tokenId, data.tokenId));
        io.to(data.roomId).emit('token-resized', {
          tokenId: data.tokenId,
          width: data.width,
          height: data.height,
        });
      } catch (error) {
        logger.error(`[TOKEN] Error resizing token ${data.tokenId}:`, error);
      }
    }
  );

  socket.on('token-scale', async (data: { roomId: string; scale: number }) => {
    try {
      const rows = await db.select().from(tokens).where(eq(tokens.roomId, data.roomId));
      for (const row of rows) {
        await db
          .update(tokens)
          .set({
            x: row.x * data.scale,
            y: row.y * data.scale,
            width: row.width * data.scale,
            height: row.height * data.scale,
          })
          .where(eq(tokens.id, row.id));
      }
      socket.to(data.roomId).emit('token-scale', data);
      logger.info(`[TOKEN] Scaled tokens for room ${data.roomId} by ${data.scale}`);
    } catch (error) {
      logger.error(`[TOKEN] Error scaling tokens for room ${data.roomId}:`, error);
    }
  });

  socket.on('token-delete', async (data: { roomId: string; tokenId: string }) => {
    try {
      const requesterId = socket.authenticatedUserId || socket.id;
      const token = await db.query.tokens.findFirst({
        where: and(eq(tokens.tokenId, data.tokenId), eq(tokens.roomId, data.roomId)),
      });
      if (!token) return;

      const ownerIds = (token.ownerIds as string[]) ?? [token.ownerId];
      if (!(await isGM(data.roomId, socket.authenticatedUserId)) && !ownerIds.includes(requesterId))
        return;

      await db.delete(tokens).where(eq(tokens.tokenId, data.tokenId));
      io.to(data.roomId).emit('token-deleted', { tokenId: data.tokenId });

      // Clear the token link on any sheet that referenced this token
      const linkedSheet = await db.query.characterSheets.findFirst({
        where: eq(characterSheets.tokenId, data.tokenId),
        columns: { id: true, roomId: true },
      });
      if (linkedSheet) {
        await db
          .update(characterSheets)
          .set({ tokenId: null })
          .where(eq(characterSheets.id, linkedSheet.id));
        io.to(linkedSheet.roomId).emit('sheet-token-unlinked', { sheetId: linkedSheet.id });
      }

      logger.info(`[TOKEN] Deleted token ${data.tokenId} from room ${data.roomId}`);
    } catch (error) {
      logger.error(`[TOKEN] Error deleting token ${data.tokenId}:`, error);
    }
  });

  socket.on(
    'token-edit',
    async (data: {
      roomId: string;
      tokenId: string;
      color?: string;
      label?: string;
      imageUrl?: string | null;
      imageOffsetX?: number;
      imageOffsetY?: number;
      imageScale?: number;
      hp?: number;
      maxHp?: number;
      conditions?: string[];
      initiative?: number;
    }) => {
      try {
        const requesterId = socket.authenticatedUserId || socket.id;
        const token = await db.query.tokens.findFirst({
          where: and(eq(tokens.tokenId, data.tokenId), eq(tokens.roomId, data.roomId)),
        });
        if (!token) return;

        const ownerIds = (token.ownerIds as string[]) ?? [token.ownerId];
        if (
          !(await isGM(data.roomId, socket.authenticatedUserId)) &&
          !ownerIds.includes(requesterId)
        )
          return;

        // Only update fields that were explicitly provided; preserve everything else
        const newColor = data.color ?? token.color;
        const newLabel = data.label ?? token.label;
        const newImageUrl = data.imageUrl !== undefined ? data.imageUrl : token.imageUrl;
        const newImageOffsetX = data.imageOffsetX ?? token.imageOffsetX;
        const newImageOffsetY = data.imageOffsetY ?? token.imageOffsetY;
        const newImageScale = data.imageScale ?? token.imageScale;
        const newHp = data.hp ?? token.hp;
        const newMaxHp = data.maxHp ?? token.maxHp;
        const newConditions = data.conditions ?? (token.conditions as string[]) ?? [];
        const newInitiative = data.initiative ?? token.initiative;

        await db
          .update(tokens)
          .set({
            color: newColor,
            label: newLabel,
            imageUrl: newImageUrl,
            imageOffsetX: newImageOffsetX,
            imageOffsetY: newImageOffsetY,
            imageScale: newImageScale,
            hp: newHp,
            maxHp: newMaxHp,
            conditions: newConditions,
            initiative: newInitiative,
          })
          .where(eq(tokens.tokenId, data.tokenId));

        io.to(data.roomId).emit('token-edited', {
          tokenId: data.tokenId,
          color: newColor,
          label: newLabel,
          imageUrl: newImageUrl,
          imageOffsetX: newImageOffsetX,
          imageOffsetY: newImageOffsetY,
          imageScale: newImageScale,
          hp: newHp,
          maxHp: newMaxHp,
          conditions: newConditions,
          initiative: newInitiative,
        });
        logger.info(`[TOKEN] Edited token ${data.tokenId}`);

        // Notify linked sheet only when stats were explicitly changed
        const statsChanged =
          data.hp !== undefined ||
          data.maxHp !== undefined ||
          data.conditions !== undefined ||
          data.initiative !== undefined;
        if (statsChanged) {
          const linkedSheet = await db.query.characterSheets.findFirst({
            where: eq(characterSheets.tokenId, data.tokenId),
            columns: { id: true, roomId: true },
          });
          if (linkedSheet) {
            io.to(linkedSheet.roomId).emit('sheet-stats-updated', {
              sheetId: linkedSheet.id,
              hp: newHp,
              maxHp: newMaxHp,
              initiative: newInitiative,
              conditions: newConditions,
            });
          }
        }
      } catch (error) {
        logger.error(`[TOKEN] Error editing token ${data.tokenId}:`, error);
      }
    }
  );

  socket.on(
    'token-assign-owners',
    async (data: { roomId: string; tokenId: string; ownerIds: string[] }) => {
      try {
        if (!(await isGM(data.roomId, socket.authenticatedUserId))) return;
        await db
          .update(tokens)
          .set({ ownerIds: data.ownerIds })
          .where(eq(tokens.tokenId, data.tokenId));
        io.to(data.roomId).emit('token-owners-updated', {
          tokenId: data.tokenId,
          ownerIds: data.ownerIds,
        });
        logger.info(`[TOKEN] Updated owners for token ${data.tokenId}`);
      } catch (error) {
        logger.error(`[TOKEN] Error assigning owners to token ${data.tokenId}:`, error);
      }
    }
  );

  socket.on(
    'token-toggle-visibility',
    async (data: { roomId: string; tokenId: string; visible: boolean }) => {
      try {
        if (!(await isGM(data.roomId, socket.authenticatedUserId))) return;
        await db
          .update(tokens)
          .set({ visible: data.visible })
          .where(eq(tokens.tokenId, data.tokenId));
        io.to(data.roomId).emit('token-visibility-updated', {
          tokenId: data.tokenId,
          visible: data.visible,
        });
        logger.info(`[TOKEN] Set token ${data.tokenId} visibility to ${data.visible}`);
      } catch (error) {
        logger.error(`[TOKEN] Error toggling visibility for token ${data.tokenId}:`, error);
      }
    }
  );

  // Emitted by frontend useSheetSync when sheetData changes on a linked sheet
  socket.on(
    'token-stats',
    async (data: {
      roomId: string;
      tokenId: string;
      hp: number;
      maxHp: number;
      conditions: string[];
    }) => {
      try {
        const requesterId = socket.authenticatedUserId || socket.id;
        const token = await db.query.tokens.findFirst({
          where: and(eq(tokens.tokenId, data.tokenId), eq(tokens.roomId, data.roomId)),
        });
        if (!token) return;

        const ownerIds = (token.ownerIds as string[]) ?? [token.ownerId];
        if (
          !(await isGM(data.roomId, socket.authenticatedUserId)) &&
          !ownerIds.includes(requesterId)
        )
          return;

        await db
          .update(tokens)
          .set({
            hp: data.hp,
            maxHp: data.maxHp,
            conditions: data.conditions,
          })
          .where(eq(tokens.tokenId, data.tokenId));

        io.to(data.roomId).emit('token-stats-updated', {
          tokenId: data.tokenId,
          hp: data.hp,
          maxHp: data.maxHp,
          conditions: data.conditions,
        });
        logger.info(`[TOKEN] Stats updated for token ${data.tokenId} from linked sheet`);
      } catch (error) {
        logger.error(`[TOKEN] Error handling token-stats for ${data.tokenId}:`, error);
      }
    }
  );
}
