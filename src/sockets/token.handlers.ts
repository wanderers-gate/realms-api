import { and, eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db';
import { rooms, tokens } from '../db/schema';
import logger from '../utils/logger';
import type { Token } from './types';

async function isDM(roomId: string, authenticatedUserId: string | undefined): Promise<boolean> {
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
    visible: row.visible,
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
    }) => {
      try {
        const ownerId = socket.authenticatedUserId || socket.id;
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
          ownerId,
          ownerIds: [ownerId],
          visible: true,
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
          ownerId,
          ownerIds: [ownerId],
          visible: true,
        };

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
          !(await isDM(data.roomId, socket.authenticatedUserId)) &&
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
          !(await isDM(data.roomId, socket.authenticatedUserId)) &&
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
      if (!(await isDM(data.roomId, socket.authenticatedUserId)) && !ownerIds.includes(requesterId))
        return;

      await db.delete(tokens).where(eq(tokens.tokenId, data.tokenId));
      io.to(data.roomId).emit('token-deleted', { tokenId: data.tokenId });
      logger.info(`[TOKEN] Deleted token ${data.tokenId} from room ${data.roomId}`);
    } catch (error) {
      logger.error(`[TOKEN] Error deleting token ${data.tokenId}:`, error);
    }
  });

  socket.on(
    'token-edit',
    async (data: { roomId: string; tokenId: string; color: string; label: string }) => {
      try {
        const requesterId = socket.authenticatedUserId || socket.id;
        const token = await db.query.tokens.findFirst({
          where: and(eq(tokens.tokenId, data.tokenId), eq(tokens.roomId, data.roomId)),
        });
        if (!token) return;

        const ownerIds = (token.ownerIds as string[]) ?? [token.ownerId];
        if (
          !(await isDM(data.roomId, socket.authenticatedUserId)) &&
          !ownerIds.includes(requesterId)
        )
          return;

        await db
          .update(tokens)
          .set({ color: data.color, label: data.label })
          .where(eq(tokens.tokenId, data.tokenId));
        io.to(data.roomId).emit('token-edited', {
          tokenId: data.tokenId,
          color: data.color,
          label: data.label,
        });
        logger.info(`[TOKEN] Edited token ${data.tokenId}`);
      } catch (error) {
        logger.error(`[TOKEN] Error editing token ${data.tokenId}:`, error);
      }
    }
  );

  socket.on(
    'token-assign-owners',
    async (data: { roomId: string; tokenId: string; ownerIds: string[] }) => {
      try {
        if (!(await isDM(data.roomId, socket.authenticatedUserId))) return;
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
        if (!(await isDM(data.roomId, socket.authenticatedUserId))) return;
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
}
