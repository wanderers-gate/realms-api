import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Request, Response } from 'express';
import multer from 'multer';
import config from '../config/config';
import { db } from '../db';
import { canvasOperations, canvases, rooms } from '../db/schema';
import { sendError } from '../helpers/response';
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
      sendError(res, 404, 'Room Not Found', 'Room not found or inactive');
      return;
    }

    if (!req.userId && !room.allowGuests) {
      sendError(res, 403, 'Forbidden', 'This room does not allow guests');
      return;
    }

    const canvas = await getOrCreateCanvas(roomId);
    if (!canvas) {
      sendError(res, 404, 'Room Not Found', 'Room not found');
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
    sendError(res, 500, 'Internal Server Error', 'Failed to fetch canvas');
  }
};

export const addCanvasOperation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      sendError(res, 401, 'Unauthorized', 'User must be authenticated to draw');
      return;
    }

    const room = await db.query.rooms.findFirst({
      where: and(eq(rooms.id, roomId), eq(rooms.isActive, true)),
    });

    if (!room) {
      sendError(res, 404, 'Room Not Found', 'Room not found or inactive');
      return;
    }

    const operationData = deserializeCanvas((req.body.data || req.body) as JsonApiResourceObject);

    if (!operationData.operations?.length) {
      sendError(res, 400, 'Bad Request', 'Invalid operation data');
      return;
    }

    const canvas = await getOrCreateCanvas(roomId);
    if (!canvas) {
      sendError(res, 404, 'Room Not Found', 'Room not found');
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
    sendError(res, 500, 'Internal Server Error', 'Failed to add drawing operation');
  }
};

export const deleteCanvasOperations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      sendError(res, 401, 'Unauthorized', 'User must be authenticated to delete operations');
      return;
    }

    const room = await db.query.rooms.findFirst({
      where: and(eq(rooms.id, roomId), eq(rooms.isActive, true)),
    });

    if (!room) {
      sendError(res, 404, 'Room Not Found', 'Room not found or inactive');
      return;
    }

    const { operationIds } = req.body as { operationIds?: unknown };

    if (!Array.isArray(operationIds) || operationIds.length === 0) {
      sendError(res, 400, 'Bad Request', 'Operation IDs array is required');
      return;
    }

    const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
    if (!canvas) {
      sendError(res, 404, 'Canvas Not Found', 'Canvas not found for this room');
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
    sendError(res, 500, 'Internal Server Error', 'Failed to delete canvas operations');
  }
};

export const mapUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

export const uploadMap = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    if (!req.userId) {
      sendError(res, 401, 'Unauthorized', 'Authentication required');
      return;
    }

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    if (room.createdById !== req.userId) {
      sendError(res, 403, 'Forbidden', 'Only the room creator can upload maps');
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, 400, 'Bad Request', 'No file uploaded');
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `map-${Date.now()}${ext}`;
    const dir = path.join(config.dataDir, 'rooms', room.slug, 'assets', 'maps');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), file.buffer);

    const mapUrl = `rooms/${room.slug}/assets/maps/${filename}`;

    const canvas = await getOrCreateCanvas(roomId);
    if (canvas) {
      await db.update(canvases).set({ mapUrl }).where(eq(canvases.id, canvas.id));
    }

    res.status(200).json({ data: { mapUrl } });
  } catch (error) {
    logger.error('Error uploading map:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to upload map');
  }
};

export const setMapUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { mapUrl } = req.body as { mapUrl?: unknown };

    if (!req.userId) {
      sendError(res, 401, 'Unauthorized', 'Authentication required');
      return;
    }

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    if (room.createdById !== req.userId) {
      sendError(res, 403, 'Forbidden', 'Only the room creator can set the map');
      return;
    }

    if (
      mapUrl !== null &&
      (typeof mapUrl !== 'string' || !mapUrl.startsWith(`rooms/${room.slug}/`))
    ) {
      sendError(res, 400, 'Bad Request', 'Invalid map URL');
      return;
    }

    const canvas = await getOrCreateCanvas(roomId);
    if (canvas) {
      await db
        .update(canvases)
        .set({ mapUrl: mapUrl as string | null })
        .where(eq(canvases.id, canvas.id));
    }

    res.status(200).json({ data: { mapUrl: mapUrl ?? null } });
  } catch (error) {
    logger.error('Error setting map URL:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to set map URL');
  }
};

export const removeMap = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    if (!req.userId) {
      sendError(res, 401, 'Unauthorized', 'Authentication required');
      return;
    }

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    if (room.createdById !== req.userId) {
      sendError(res, 403, 'Forbidden', 'Only the room creator can remove maps');
      return;
    }

    const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
    if (canvas) {
      await db.update(canvases).set({ mapUrl: null }).where(eq(canvases.id, canvas.id));
    }

    res.status(200).json({ data: { mapUrl: null } });
  } catch (error) {
    logger.error('Error removing map:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to remove map');
  }
};
