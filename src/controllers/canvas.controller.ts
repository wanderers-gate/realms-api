import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { canvasOperations, canvases, rooms } from '../db/schema';
import {
  deserializeCanvas,
  serializeCanvas,
  serializeCanvasOperations,
} from '../serializers/canvas.serializer';
import type { CanvasOperation } from '../types/canvas';
import type { JsonApiResourceObject } from '../types/json-api';
import logger from '../utils/logger';

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

export const getCanvas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    const room = await db.query.rooms.findFirst({
      where: and(eq(rooms.id, roomId), eq(rooms.isActive, true)),
    });

    if (!room) {
      res
        .status(404)
        .json({
          errors: [
            { status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' },
          ],
        });
      return;
    }

    if (!req.userId && !room.allowGuests) {
      res
        .status(403)
        .json({
          errors: [
            { status: '403', title: 'Forbidden', detail: 'This room does not allow guests' },
          ],
        });
      return;
    }

    const canvas = await getOrCreateCanvas(roomId);
    if (!canvas) {
      res
        .status(404)
        .json({ errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found' }] });
      return;
    }

    const ops = await db
      .select()
      .from(canvasOperations)
      .where(eq(canvasOperations.canvasId, canvas.id))
      .orderBy(asc(canvasOperations.timestamp));

    res.json(serializeCanvas(canvas, ops));
  } catch (error) {
    logger.error('Error fetching canvas:', error);
    res
      .status(500)
      .json({
        errors: [
          { status: '500', title: 'Internal Server Error', detail: 'Failed to fetch canvas' },
        ],
      });
  }
};

export const addCanvasOperation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      res
        .status(401)
        .json({
          errors: [
            { status: '401', title: 'Unauthorized', detail: 'User must be authenticated to draw' },
          ],
        });
      return;
    }

    const room = await db.query.rooms.findFirst({
      where: and(eq(rooms.id, roomId), eq(rooms.isActive, true)),
    });

    if (!room) {
      res
        .status(404)
        .json({
          errors: [
            { status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' },
          ],
        });
      return;
    }

    const operationData = deserializeCanvas((req.body.data || req.body) as JsonApiResourceObject);

    if (!operationData.operations?.length) {
      res
        .status(400)
        .json({
          errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid operation data' }],
        });
      return;
    }

    const canvas = await getOrCreateCanvas(roomId);
    if (!canvas) {
      res
        .status(404)
        .json({ errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found' }] });
      return;
    }

    const newOperation: CanvasOperation = {
      ...operationData.operations[0],
      id: randomUUID(),
      timestamp: new Date(),
      userId,
    };

    await db.insert(canvasOperations).values({
      canvasId: canvas.id,
      opId: newOperation.id,
      type: newOperation.type,
      tool: newOperation.tool,
      points: newOperation.points,
      color: newOperation.color,
      size: newOperation.size,
      userId: newOperation.userId,
      timestamp: newOperation.timestamp,
    });

    res.status(201).json(serializeCanvasOperations([newOperation]));
  } catch (error) {
    logger.error('Error adding canvas operation:', error);
    res
      .status(500)
      .json({
        errors: [
          {
            status: '500',
            title: 'Internal Server Error',
            detail: 'Failed to add drawing operation',
          },
        ],
      });
  }
};

export const deleteCanvasOperations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      res
        .status(401)
        .json({
          errors: [
            {
              status: '401',
              title: 'Unauthorized',
              detail: 'User must be authenticated to delete operations',
            },
          ],
        });
      return;
    }

    const room = await db.query.rooms.findFirst({
      where: and(eq(rooms.id, roomId), eq(rooms.isActive, true)),
    });

    if (!room) {
      res
        .status(404)
        .json({
          errors: [
            { status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' },
          ],
        });
      return;
    }

    const { operationIds } = req.body as { operationIds?: unknown };

    if (!Array.isArray(operationIds) || operationIds.length === 0) {
      res
        .status(400)
        .json({
          errors: [
            { status: '400', title: 'Bad Request', detail: 'Operation IDs array is required' },
          ],
        });
      return;
    }

    const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
    if (!canvas) {
      res
        .status(404)
        .json({
          errors: [
            { status: '404', title: 'Canvas Not Found', detail: 'Canvas not found for this room' },
          ],
        });
      return;
    }

    const stringIds = operationIds.filter((id): id is string => typeof id === 'string');
    const deleted = await db
      .delete(canvasOperations)
      .where(
        and(eq(canvasOperations.canvasId, canvas.id), inArray(canvasOperations.opId, stringIds))
      )
      .returning();

    logger.info(
      `[CANVAS] Deleted ${deleted.length} operations from room ${roomId} by user ${userId}`
    );

    const remaining = await db
      .select({ count: canvasOperations.id })
      .from(canvasOperations)
      .where(eq(canvasOperations.canvasId, canvas.id));

    res
      .status(200)
      .json({ data: { deletedCount: deleted.length, remainingOperations: remaining.length } });
  } catch (error) {
    logger.error('Error deleting canvas operations:', error);
    res
      .status(500)
      .json({
        errors: [
          {
            status: '500',
            title: 'Internal Server Error',
            detail: 'Failed to delete canvas operations',
          },
        ],
      });
  }
};
