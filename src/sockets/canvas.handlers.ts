import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db';
import { canvasOperations, canvases, rooms, tokens, userPermissions } from '../db/schema';
import type { CanvasOperation, DrawingEvent, Point } from '../types/canvas';
import logger from '../utils/logger';

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

async function getOrCreateCanvas(roomId: string) {
  const existing = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
  if (existing) return existing;

  const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
  if (!room) return null;

  const [canvas] = await db
    .insert(canvases)
    .values({ roomId, createdById: room.createdById })
    .returning();
  return canvas;
}

async function getRoomPermissions(roomId: string, authenticatedUserId: string | undefined) {
  const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
  if (!room) return { isDM: false, hasModifyPermission: false };

  const isDM = !!authenticatedUserId && room.createdById === authenticatedUserId;

  const permission = authenticatedUserId
    ? await db.query.userPermissions.findFirst({
        where: and(
          eq(userPermissions.roomId, roomId),
          eq(userPermissions.userId, authenticatedUserId)
        ),
      })
    : undefined;

  return { isDM, hasModifyPermission: permission?.canModifyDrawings ?? false };
}

export async function savePendingOperations(roomId: string): Promise<void> {
  const operations = pendingCanvasOperations.get(roomId);
  if (!operations || operations.length === 0) return;

  try {
    const canvas = await getOrCreateCanvas(roomId);
    if (!canvas) {
      logger.error(`[CANVAS] Room not found for batch save: ${roomId}`);
      return;
    }

    await db.insert(canvasOperations).values(
      operations.map((op) => ({
        canvasId: canvas.id,
        opId: op.id,
        type: op.type,
        tool: op.tool,
        points: op.points,
        color: op.color,
        size: op.size,
        userId: op.userId,
        timestamp: op.timestamp,
      }))
    );

    await db
      .update(canvases)
      .set({ lastModified: new Date(), version: canvas.version + 1 })
      .where(eq(canvases.id, canvas.id));

    logger.info(`[CANVAS] Batch saved ${operations.length} operations for room ${roomId}`);
    pendingCanvasOperations.delete(roomId);
  } catch (error) {
    logger.error(`[CANVAS] Error in batch save for room ${roomId}:`, error);
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
    const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
    if (!canvas) return [];

    const ops = await db
      .select()
      .from(canvasOperations)
      .where(eq(canvasOperations.canvasId, canvas.id))
      .orderBy(asc(canvasOperations.timestamp));

    if (ops.length > 0) {
      logger.info(`[CANVAS] Loaded ${ops.length} operations for room ${roomId}`);
    }

    return ops.map((op) => ({
      id: op.opId,
      type: op.type as CanvasOperation['type'],
      tool: op.tool as CanvasOperation['tool'],
      points: op.points as Point[],
      color: op.color,
      size: op.size,
      timestamp: op.timestamp,
      userId: op.userId,
    }));
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
    const effectiveUserId = socket.authenticatedUserId || socket.id;
    const operation = createCanvasOperation({ ...drawingEvent, userId: effectiveUserId });

    socket.to(drawingEvent.roomId).emit('canvas-draw', {
      ...drawingEvent,
      operationId: operation.id,
      timestamp: operation.timestamp,
    });

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
      const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
      if (!canvas) return;

      const lastOp = await db.query.canvasOperations.findFirst({
        where: eq(canvasOperations.canvasId, canvas.id),
        orderBy: [desc(canvasOperations.timestamp)],
      });
      if (!lastOp) return;

      await db.delete(canvasOperations).where(eq(canvasOperations.id, lastOp.id));
      logger.info(`[CANVAS] Undid last operation for room ${roomId}`);
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
      const { isDM, hasModifyPermission } = await getRoomPermissions(
        data.roomId,
        socket.authenticatedUserId
      );

      const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, data.roomId) });
      if (!canvas) return;

      const opsToDelete = await db
        .select()
        .from(canvasOperations)
        .where(
          and(
            eq(canvasOperations.canvasId, canvas.id),
            inArray(canvasOperations.opId, data.operationIds)
          )
        );

      const allowed = opsToDelete.filter(
        (op) => isDM || hasModifyPermission || op.userId === requesterUserId
      );
      if (allowed.length === 0) return;

      await db.delete(canvasOperations).where(
        inArray(
          canvasOperations.id,
          allowed.map((op) => op.id)
        )
      );
      logger.info(`[CANVAS] Deleted ${allowed.length} operations for room ${data.roomId}`);

      socket.to(data.roomId).emit('canvas-delete', {
        roomId: data.roomId,
        operationIds: allowed.map((op) => op.opId),
        deletedCount: allowed.length,
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
        const { isDM, hasModifyPermission } = await getRoomPermissions(
          data.roomId,
          socket.authenticatedUserId
        );

        const canvas = await db.query.canvases.findFirst({
          where: eq(canvases.roomId, data.roomId),
        });
        if (!canvas) return;

        const op = await db.query.canvasOperations.findFirst({
          where: and(
            eq(canvasOperations.canvasId, canvas.id),
            eq(canvasOperations.opId, data.operationId)
          ),
        });
        if (!op) return;

        if (!isDM && !hasModifyPermission && op.userId !== requesterUserId) return;

        const newPoints = (op.points as Point[]).map((p) => ({
          x: p.x + data.dx,
          y: p.y + data.dy,
        }));
        await db
          .update(canvasOperations)
          .set({ points: newPoints })
          .where(eq(canvasOperations.id, op.id));

        socket.to(data.roomId).emit('shape-moved', data);
        logger.info(`[CANVAS] Moved shape ${data.operationId} in room ${data.roomId}`);
      } catch (error) {
        logger.error(`[CANVAS] Error moving shape in room ${data.roomId}:`, error);
      }
    }
  );

  socket.on('canvas-scale', async (data: { roomId: string; scaleX: number; scaleY: number }) => {
    try {
      const { isDM } = await getRoomPermissions(data.roomId, socket.authenticatedUserId);
      if (!isDM) return;

      await savePendingOperations(data.roomId);

      const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, data.roomId) });
      if (canvas) {
        const ops = await db
          .select()
          .from(canvasOperations)
          .where(eq(canvasOperations.canvasId, canvas.id));

        for (const op of ops) {
          const newPoints = (op.points as Point[]).map((p) => ({
            x: p.x * data.scaleX,
            y: p.y * data.scaleY,
          }));
          await db
            .update(canvasOperations)
            .set({ points: newPoints })
            .where(eq(canvasOperations.id, op.id));
        }

        logger.info(
          `[CANVAS] Scaled ${ops.length} operations for room ${data.roomId} by (${data.scaleX}, ${data.scaleY})`
        );
      }

      const roomTokens = await db.select().from(tokens).where(eq(tokens.roomId, data.roomId));
      for (const token of roomTokens) {
        await db
          .update(tokens)
          .set({
            x: token.x * data.scaleX,
            y: token.y * data.scaleY,
            width: token.width * data.scaleX,
            height: token.height * data.scaleY,
          })
          .where(eq(tokens.id, token.id));
      }

      socket.to(data.roomId).emit('canvas-scale', data);
    } catch (error) {
      logger.error(`[CANVAS] Error scaling canvas for room ${data.roomId}:`, error);
    }
  });

  socket.on('grid-settings-update', async (data: { roomId: string; gridSettings: unknown }) => {
    try {
      const { isDM } = await getRoomPermissions(data.roomId, socket.authenticatedUserId);
      if (!isDM) return;
      socket.to(data.roomId).emit('grid-settings-update', data);
    } catch (error) {
      logger.error(`[GRID] Error broadcasting grid settings for room ${data.roomId}:`, error);
    }
  });
}
