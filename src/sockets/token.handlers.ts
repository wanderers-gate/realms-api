import type { Server, Socket } from 'socket.io';
import { RoomModel } from '../models/room-model';
import { type Token, TokenModel } from '../models/token-model';
import logger from '../utils/logger';

export async function loadTokens(roomId: string): Promise<Token[]> {
  try {
    const docs = await TokenModel.find({ roomId }).lean();
    return docs.map((t) => ({
      id: t.id,
      roomId: t.roomId,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      color: t.color,
      label: t.label,
      ownerId: t.ownerId,
      ownerIds: t.ownerIds?.length ? t.ownerIds : [t.ownerId],
      imageUrl: t.imageUrl,
      visible: t.visible ?? true,
    }));
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
        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const token: Token = {
          id,
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
        await TokenModel.create(token);
        io.to(data.roomId).emit('token-added', token);
        logger.info(`[TOKEN] Added token ${id} to room ${data.roomId}`);
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
        const [token, roomDoc] = await Promise.all([
          TokenModel.findOne({ id: data.tokenId, roomId: data.roomId }),
          RoomModel.findOne({ roomId: data.roomId }),
        ]);
        if (!token) return;
        const isDM =
          socket.authenticatedUserId &&
          roomDoc?.createdBy.toString() === socket.authenticatedUserId;
        const ownerIds = token.ownerIds?.length ? token.ownerIds : [token.ownerId];
        if (!isDM && !ownerIds.includes(requesterId)) return;
        await TokenModel.updateOne({ id: data.tokenId }, { x: data.x, y: data.y });
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
        const [token, roomDoc] = await Promise.all([
          TokenModel.findOne({ id: data.tokenId, roomId: data.roomId }),
          RoomModel.findOne({ roomId: data.roomId }),
        ]);
        if (!token) return;
        const isDM =
          socket.authenticatedUserId &&
          roomDoc?.createdBy.toString() === socket.authenticatedUserId;
        const ownerIds = token.ownerIds?.length ? token.ownerIds : [token.ownerId];
        if (!isDM && !ownerIds.includes(requesterId)) return;
        await TokenModel.updateOne(
          { id: data.tokenId },
          { width: data.width, height: data.height }
        );
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
      await TokenModel.updateMany({ roomId: data.roomId }, [
        {
          $set: {
            x: { $multiply: ['$x', data.scale] },
            y: { $multiply: ['$y', data.scale] },
            width: { $multiply: ['$width', data.scale] },
            height: { $multiply: ['$height', data.scale] },
          },
        },
      ]);
      socket.to(data.roomId).emit('token-scale', data);
      logger.info(`[TOKEN] Scaled tokens for room ${data.roomId} by ${data.scale}`);
    } catch (error) {
      logger.error(`[TOKEN] Error scaling tokens for room ${data.roomId}:`, error);
    }
  });

  socket.on('token-delete', async (data: { roomId: string; tokenId: string }) => {
    try {
      const requesterId = socket.authenticatedUserId || socket.id;
      const [token, roomDoc] = await Promise.all([
        TokenModel.findOne({ id: data.tokenId, roomId: data.roomId }),
        RoomModel.findOne({ roomId: data.roomId }),
      ]);
      if (!token) return;
      const isDM =
        socket.authenticatedUserId && roomDoc?.createdBy.toString() === socket.authenticatedUserId;
      const ownerIds = token.ownerIds?.length ? token.ownerIds : [token.ownerId];
      if (!isDM && !ownerIds.includes(requesterId)) return;
      await TokenModel.deleteOne({ id: data.tokenId });
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
        const [token, roomDoc] = await Promise.all([
          TokenModel.findOne({ id: data.tokenId, roomId: data.roomId }),
          RoomModel.findOne({ roomId: data.roomId }),
        ]);
        if (!token) return;
        const isDM =
          socket.authenticatedUserId &&
          roomDoc?.createdBy.toString() === socket.authenticatedUserId;
        const ownerIds = token.ownerIds?.length ? token.ownerIds : [token.ownerId];
        if (!isDM && !ownerIds.includes(requesterId)) return;
        await TokenModel.updateOne({ id: data.tokenId }, { color: data.color, label: data.label });
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
        const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
        const isDM =
          socket.authenticatedUserId &&
          roomDoc?.createdBy.toString() === socket.authenticatedUserId;
        if (!isDM) return;
        await TokenModel.updateOne({ id: data.tokenId }, { ownerIds: data.ownerIds });
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
        const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
        const isDM =
          socket.authenticatedUserId &&
          roomDoc?.createdBy.toString() === socket.authenticatedUserId;
        if (!isDM) return;
        await TokenModel.updateOne({ id: data.tokenId }, { visible: data.visible });
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
