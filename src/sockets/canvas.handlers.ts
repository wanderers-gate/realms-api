import type { Server, Socket } from 'socket.io';
import { CanvasModel } from '../models/canvas-model';
import { RoomModel } from '../models/room-model';
import { TokenModel } from '../models/token-model';
import type { CanvasOperation, DrawingEvent } from '../types/canvas';
import logger from '../utils/logger';

// Module-level maps so pending ops survive across socket events and can be flushed on disconnect
export const pendingCanvasOperations = new Map<string, CanvasOperation[]>();
const canvasSaveTimer = new Map<string, NodeJS.Timeout>();

const createCanvasOperation = (drawingEvent: DrawingEvent & { id?: string }): CanvasOperation => ({
  id: drawingEvent.id || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  type: drawingEvent.type,
  tool: drawingEvent.tool,
  points: drawingEvent.points,
  color: drawingEvent.color,
  size: drawingEvent.size,
  timestamp: new Date(),
  userId: drawingEvent.userId,
});

export async function savePendingOperations(roomId: string): Promise<void> {
  const operations = pendingCanvasOperations.get(roomId);
  if (!operations || operations.length === 0) return;

  try {
    const room = await RoomModel.findOne({ roomId });
    if (!room) {
      logger.error(`[CANVAS] Room not found for batch save: ${roomId}`);
      return;
    }

    const result = await CanvasModel.findOneAndUpdate(
      { roomId },
      { $push: { operations: { $each: operations } } },
      { new: true }
    );

    if (result) {
      logger.info(`[CANVAS] Batch saved ${operations.length} operations for room ${roomId}`);
    } else {
      const newCanvas = new CanvasModel({ roomId, operations, createdBy: room.createdBy });
      await newCanvas.save();
      logger.info(
        `[CANVAS] Created new canvas with ${operations.length} operations for room ${roomId}`
      );
    }

    pendingCanvasOperations.delete(roomId);
  } catch (error) {
    logger.error(`[CANVAS] Error in batch save for room ${roomId}:`, error);
    // Keep ops for retry but cap size to prevent unbounded memory growth
    const currentOps = pendingCanvasOperations.get(roomId) || [];
    if (currentOps.length > 1000) {
      pendingCanvasOperations.set(roomId, currentOps.slice(-100));
      logger.warn(
        `[CANVAS] Trimmed pending operations for room ${roomId} due to repeated failures`
      );
    }
  }
}

export async function loadExistingCanvas(roomId: string): Promise<CanvasOperation[]> {
  try {
    const canvas = await CanvasModel.findOne({ roomId });
    if (canvas && canvas.operations.length > 0) {
      logger.info(`[CANVAS] Loaded ${canvas.operations.length} operations for room ${roomId}`);
      return canvas.operations;
    }
    return [];
  } catch (error) {
    logger.error(`[CANVAS] Error loading canvas for room ${roomId}:`, error);
    return [];
  }
}

function scheduleSave(roomId: string): void {
  const existing = canvasSaveTimer.get(roomId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    canvasSaveTimer.delete(roomId);
    savePendingOperations(roomId);
  }, 2000);
  canvasSaveTimer.set(roomId, timer);
}

export function registerCanvasHandlers(socket: Socket, _io: Server): void {
  socket.on('canvas-draw', (drawingEvent: DrawingEvent & { id?: string }) => {
    // Always use server-verified userId, not client-provided
    const effectiveUserId = socket.authenticatedUserId || socket.id;
    const operation = createCanvasOperation({ ...drawingEvent, userId: effectiveUserId });

    socket.to(drawingEvent.roomId).emit('canvas-draw', {
      ...drawingEvent,
      operationId: operation.id,
      timestamp: operation.timestamp,
    });

    // Only persist completion events (have an id), not real-time pen segments
    if (drawingEvent.id) {
      const existingOps = pendingCanvasOperations.get(drawingEvent.roomId) || [];
      existingOps.push(operation);
      pendingCanvasOperations.set(drawingEvent.roomId, existingOps);
      scheduleSave(drawingEvent.roomId);
    }
  });

  socket.on('canvas-undo', async (roomId: string) => {
    logger.info(`[CANVAS] Received undo event from ${socket.id} in room ${roomId}`);
    try {
      const canvas = await CanvasModel.findOne({ roomId });
      if (canvas && canvas.operations.length > 0) {
        canvas.operations.pop();
        await canvas.save();
        logger.info(`[CANVAS] Undid last operation for room ${roomId}`);
      }
      socket.to(roomId).emit('canvas-undo', roomId);
    } catch (error) {
      logger.error(`[CANVAS] Error undoing operation for room ${roomId}:`, error);
    }
  });

  socket.on('canvas-delete', async (data: { roomId: string; operationIds: string[] }) => {
    logger.info(
      `[CANVAS] Received delete event from ${socket.id} in room ${data.roomId} for ${data.operationIds.length} operations`
    );
    try {
      await savePendingOperations(data.roomId);

      const requesterUserId = socket.authenticatedUserId || socket.id;
      const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
      const isDM =
        socket.authenticatedUserId && roomDoc?.createdBy.toString() === socket.authenticatedUserId;
      const hasModifyPermission = roomDoc?.userPermissions.some(
        (p) => p.userId === requesterUserId && p.canModifyDrawings
      );

      const canvas = await CanvasModel.findOne({ roomId: data.roomId });
      if (!canvas) return;

      const allowedIds = new Set(
        canvas.operations
          .filter((op) => data.operationIds.includes(op.id))
          .filter((op) => isDM || hasModifyPermission || op.userId === requesterUserId)
          .map((op) => op.id)
      );

      if (allowedIds.size === 0) return;

      const initialCount = canvas.operations.length;
      canvas.operations = canvas.operations.filter((op) => !allowedIds.has(op.id));
      const deletedCount = initialCount - canvas.operations.length;

      await canvas.save();
      logger.info(`[CANVAS] Deleted ${deletedCount} operations for room ${data.roomId}`);

      socket.to(data.roomId).emit('canvas-delete', {
        roomId: data.roomId,
        operationIds: Array.from(allowedIds),
        deletedCount,
      });
    } catch (error) {
      logger.error(`[CANVAS] Error deleting canvas operations for room ${data.roomId}:`, error);
    }
  });

  socket.on(
    'shape-move',
    async (data: { roomId: string; operationId: string; dx: number; dy: number }) => {
      try {
        await savePendingOperations(data.roomId);
        const requesterUserId = socket.authenticatedUserId || socket.id;
        const [canvas, roomDoc] = await Promise.all([
          CanvasModel.findOne({ roomId: data.roomId }),
          RoomModel.findOne({ roomId: data.roomId }),
        ]);
        if (!canvas) return;
        const op = canvas.operations.find((o) => o.id === data.operationId);
        if (!op) return;
        const isDM =
          socket.authenticatedUserId &&
          roomDoc?.createdBy.toString() === socket.authenticatedUserId;
        const hasModifyPermission = roomDoc?.userPermissions.some(
          (p) => p.userId === requesterUserId && p.canModifyDrawings
        );
        if (!isDM && !hasModifyPermission && op.userId !== requesterUserId) return;
        op.points = op.points.map((p) => ({ x: p.x + data.dx, y: p.y + data.dy }));
        await canvas.save();
        socket.to(data.roomId).emit('shape-moved', data);
        logger.info(`[CANVAS] Moved shape ${data.operationId} in room ${data.roomId}`);
      } catch (error) {
        logger.error(`[CANVAS] Error moving shape in room ${data.roomId}:`, error);
      }
    }
  );

  socket.on('canvas-scale', async (data: { roomId: string; scaleX: number; scaleY: number }) => {
    try {
      const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
      if (!roomDoc) return;
      const isDM =
        socket.authenticatedUserId && roomDoc.createdBy.toString() === socket.authenticatedUserId;
      if (!isDM) return;

      // Flush pending ops before scaling so nothing is missed
      await savePendingOperations(data.roomId);

      const canvas = await CanvasModel.findOne({ roomId: data.roomId });
      if (canvas && canvas.operations.length > 0) {
        for (const op of canvas.operations) {
          op.points = op.points.map((p) => ({ x: p.x * data.scaleX, y: p.y * data.scaleY }));
        }
        canvas.markModified('operations');
        await canvas.save();
        logger.info(
          `[CANVAS] Scaled ${canvas.operations.length} operations for room ${data.roomId} by (${data.scaleX}, ${data.scaleY})`
        );
      }

      await TokenModel.updateMany({ roomId: data.roomId }, [
        {
          $set: {
            x: { $multiply: ['$x', data.scaleX] },
            y: { $multiply: ['$y', data.scaleY] },
            width: { $multiply: ['$width', data.scaleX] },
            height: { $multiply: ['$height', data.scaleY] },
          },
        },
      ]);

      socket.to(data.roomId).emit('canvas-scale', data);
    } catch (error) {
      logger.error(`[CANVAS] Error scaling canvas operations for room ${data.roomId}:`, error);
    }
  });

  socket.on('grid-settings-update', async (data: { roomId: string; gridSettings: unknown }) => {
    try {
      const roomDoc = await RoomModel.findOne({ roomId: data.roomId });
      if (!roomDoc) return;
      const isDM =
        socket.authenticatedUserId && roomDoc.createdBy.toString() === socket.authenticatedUserId;
      if (!isDM) return;
      socket.to(data.roomId).emit('grid-settings-update', data);
    } catch (error) {
      logger.error(`[GRID] Error broadcasting grid settings for room ${data.roomId}:`, error);
    }
  });
}
