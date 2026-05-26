import { and, count, desc, eq, like, or } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { rooms, users } from '../db/schema';
import { createRoomDirs, renameRoomDir, slugify } from '../helpers/storage';
import {
  type Room,
  deserializeRoom,
  serializeRoomWithIncludes,
} from '../serializers/room.serializer';
import type { JsonApiResourceObject } from '../types/json-api';
import logger from '../utils/logger';

type CreatorInfo = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
};

const serializeRoomWithCreator = (room: Room, creator: CreatorInfo) =>
  serializeRoomWithIncludes(room, {
    createdBy: {
      id: creator.id,
      type: 'user',
      attributes: {
        firstName: creator.firstName,
        lastName: creator.lastName,
        displayName: creator.displayName,
      },
    },
  });

const generateRoomCode = async (): Promise<string> => {
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const existing = await db.query.rooms.findFirst({ where: eq(rooms.roomCode, code) });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique room code');
};

const generateUniqueSlug = async (name: string, excludeId?: string): Promise<string> => {
  const base = slugify(name);
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing = await db.query.rooms.findFirst({ where: eq(rooms.slug, candidate) });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${counter}`;
    counter++;
  }
};

export const createRoom = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to create a room',
          },
        ],
      });
    }

    const creator = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!creator) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'User Not Found', detail: 'User not found' }],
      });
    }

    const { name, description, maxPlayers, settings } = deserializeRoom(req.body);
    if (!name) {
      return res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Room name is required' }],
      });
    }

    const existing = await db.query.rooms.findFirst({ where: eq(rooms.name, name) });
    if (existing) {
      return res.status(409).json({
        errors: [
          { status: '409', title: 'Conflict', detail: 'A room with that name already exists' },
        ],
      });
    }

    const [slug, roomCode] = await Promise.all([generateUniqueSlug(name), generateRoomCode()]);

    const [room] = await db
      .insert(rooms)
      .values({
        name,
        slug,
        description: description || null,
        roomCode,
        createdById: userId,
        maxPlayers: maxPlayers || 10,
        isPrivate: settings?.isPrivate ?? false,
        allowGuests: settings?.allowGuests ?? true,
        gridSize: settings?.gridSize ?? 50,
        gridVisible: settings?.gridVisible ?? true,
        gridType: settings?.gridType ?? 'square',
        snapToGrid: settings?.snapToGrid ?? false,
        gridOpacity: settings?.gridOpacity ?? 0.6,
        canvasWidth: settings?.canvasWidth ?? 3000,
        canvasHeight: settings?.canvasHeight ?? 2000,
      })
      .returning();

    createRoomDirs(slug);

    return res.status(201).json(serializeRoomWithCreator(room, creator));
  } catch (error) {
    logger.error('Error creating room:', error);
    return res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to create room' }],
    });
  }
};

export const getRooms = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const conditions = [
      eq(rooms.isActive, true),
      ...(!req.userId ? [eq(rooms.allowGuests, true)] : []),
      ...(search ? [like(rooms.name, `%${search as string}%`)] : []),
    ];

    const [roomList, [{ total }]] = await Promise.all([
      db
        .select({ room: rooms, creator: users })
        .from(rooms)
        .leftJoin(users, eq(rooms.createdById, users.id))
        .where(and(...conditions))
        .orderBy(desc(rooms.lastActivity))
        .offset(skip)
        .limit(Number(limit)),
      db
        .select({ total: count() })
        .from(rooms)
        .where(and(...conditions)),
    ]);

    const includes: Record<string, JsonApiResourceObject> = {};
    for (const { creator } of roomList) {
      if (creator) {
        includes[`user-${creator.id}`] = {
          id: creator.id,
          type: 'user',
          attributes: {
            firstName: creator.firstName,
            lastName: creator.lastName,
            displayName: creator.displayName,
          },
        };
      }
    }

    const response = serializeRoomWithIncludes(
      roomList.map((r) => r.room),
      includes
    );
    response.meta = {
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };

    return res.json(response);
  } catch (error) {
    logger.error('Error fetching rooms:', error);
    return res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to fetch rooms' }],
    });
  }
};

export const getRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    const result = await db
      .select({ room: rooms, creator: users })
      .from(rooms)
      .leftJoin(users, eq(rooms.createdById, users.id))
      .where(
        and(
          or(eq(rooms.id, roomId), eq(rooms.roomCode, roomId.toUpperCase())),
          eq(rooms.isActive, true)
        )
      )
      .limit(1);

    if (!result.length) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    }

    const { room, creator } = result[0];

    if (!req.userId && !room.allowGuests) {
      return res.status(403).json({
        errors: [
          {
            status: '403',
            title: 'Access Denied',
            detail: 'This room does not allow guest access',
          },
        ],
      });
    }

    return res.json(
      creator ? serializeRoomWithCreator(room, creator) : serializeRoomWithIncludes(room)
    );
  } catch (error) {
    logger.error('Error fetching room:', error);
    return res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to fetch room' }],
    });
  }
};

export const updateRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to update a room',
          },
        ],
      });
    }

    const room = await db.query.rooms.findFirst({
      where: and(eq(rooms.id, roomId), eq(rooms.isActive, true)),
    });

    if (!room) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    }

    if (room.createdById !== userId) {
      return res.status(403).json({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'Only the room creator can update the room',
          },
        ],
      });
    }

    const { name, description, maxPlayers, settings } = deserializeRoom(req.body);
    const updates: Partial<typeof rooms.$inferInsert> = { lastActivity: new Date() };

    if (name !== undefined && name !== room.name) {
      const existing = await db.query.rooms.findFirst({ where: eq(rooms.name, name) });
      if (existing) {
        return res.status(409).json({
          errors: [
            { status: '409', title: 'Conflict', detail: 'A room with that name already exists' },
          ],
        });
      }
      const newSlug = await generateUniqueSlug(name, room.id);
      renameRoomDir(room.slug, newSlug);
      updates.name = name;
      updates.slug = newSlug;
    }

    if (description !== undefined) updates.description = description;
    if (maxPlayers !== undefined) updates.maxPlayers = maxPlayers;
    if (settings?.isPrivate !== undefined) updates.isPrivate = settings.isPrivate;
    if (settings?.allowGuests !== undefined) updates.allowGuests = settings.allowGuests;
    if (settings?.gridSize !== undefined) updates.gridSize = settings.gridSize;
    if (settings?.gridVisible !== undefined) updates.gridVisible = settings.gridVisible;
    if (settings?.gridType !== undefined) updates.gridType = settings.gridType;
    if (settings?.snapToGrid !== undefined) updates.snapToGrid = settings.snapToGrid;
    if (settings?.gridOpacity !== undefined) updates.gridOpacity = settings.gridOpacity;
    if (settings?.canvasWidth !== undefined) updates.canvasWidth = settings.canvasWidth;
    if (settings?.canvasHeight !== undefined) updates.canvasHeight = settings.canvasHeight;

    const [updated] = await db.update(rooms).set(updates).where(eq(rooms.id, room.id)).returning();

    const creator = await db.query.users.findFirst({ where: eq(users.id, userId) });
    return res.json(
      creator ? serializeRoomWithCreator(updated, creator) : serializeRoomWithIncludes(updated)
    );
  } catch (error) {
    logger.error('Error updating room:', error);
    return res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to update room' }],
    });
  }
};

export const deleteRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to delete a room',
          },
        ],
      });
    }

    const room = await db.query.rooms.findFirst({
      where: and(eq(rooms.id, roomId), eq(rooms.isActive, true)),
    });

    if (!room) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    }

    if (room.createdById !== userId) {
      return res.status(403).json({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'Only the room creator can delete the room',
          },
        ],
      });
    }

    await db.update(rooms).set({ isActive: false }).where(eq(rooms.id, room.id));
    return res.status(204).json({});
  } catch (error) {
    logger.error('Error deleting room:', error);
    return res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to delete room' }],
    });
  }
};
