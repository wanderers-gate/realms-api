import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Request, Response } from 'express';
import multer from 'multer';
import config from '../config/config';
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
      res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
      return;
    }

    if (!req.userId && !room.allowGuests) {
      res.status(403).json({
        errors: [{ status: '403', title: 'Forbidden', detail: 'This room does not allow guests' }],
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
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to fetch canvas' }],
    });
  }
};

export const addCanvasOperation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
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
      res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
      return;
    }

    const operationData = deserializeCanvas((req.body.data || req.body) as JsonApiResourceObject);

    if (!operationData.operations?.length) {
      res.status(400).json({
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
    res.status(500).json({
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
      res.status(401).json({
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
      res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
      return;
    }

    const { operationIds } = req.body as { operationIds?: unknown };

    if (!Array.isArray(operationIds) || operationIds.length === 0) {
      res.status(400).json({
        errors: [
          { status: '400', title: 'Bad Request', detail: 'Operation IDs array is required' },
        ],
      });
      return;
    }

    const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
    if (!canvas) {
      res.status(404).json({
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
    res.status(500).json({
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
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'Authentication required' }],
      });
      return;
    }

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) {
      res
        .status(404)
        .json({ errors: [{ status: '404', title: 'Not Found', detail: 'Room not found' }] });
      return;
    }

    if (room.createdById !== req.userId) {
      res.status(403).json({
        errors: [
          { status: '403', title: 'Forbidden', detail: 'Only the room creator can upload maps' },
        ],
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res
        .status(400)
        .json({ errors: [{ status: '400', title: 'Bad Request', detail: 'No file uploaded' }] });
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
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to upload map' }],
    });
  }
};

export const setMapUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { mapUrl } = req.body as { mapUrl?: unknown };

    if (!req.userId) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'Authentication required' }],
      });
      return;
    }

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) {
      res.status(404).json({
        errors: [{ status: '404', title: 'Not Found', detail: 'Room not found' }],
      });
      return;
    }

    if (room.createdById !== req.userId) {
      res.status(403).json({
        errors: [
          { status: '403', title: 'Forbidden', detail: 'Only the room creator can set the map' },
        ],
      });
      return;
    }

    if (
      mapUrl !== null &&
      (typeof mapUrl !== 'string' || !mapUrl.startsWith(`rooms/${room.slug}/`))
    ) {
      res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid map URL' }],
      });
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
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to set map URL' }],
    });
  }
};

export const removeMap = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    if (!req.userId) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'Authentication required' }],
      });
      return;
    }

    const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!room) {
      res
        .status(404)
        .json({ errors: [{ status: '404', title: 'Not Found', detail: 'Room not found' }] });
      return;
    }

    if (room.createdById !== req.userId) {
      res.status(403).json({
        errors: [
          { status: '403', title: 'Forbidden', detail: 'Only the room creator can remove maps' },
        ],
      });
      return;
    }

    const canvas = await db.query.canvases.findFirst({ where: eq(canvases.roomId, roomId) });
    if (canvas) {
      await db.update(canvases).set({ mapUrl: null }).where(eq(canvases.id, canvas.id));
    }

    res.status(200).json({ data: { mapUrl: null } });
  } catch (error) {
    logger.error('Error removing map:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to remove map' }],
    });
  }
};
