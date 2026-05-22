import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { type RoomDocument, RoomModel } from '../models/room-model';
import { UserModel } from '../models/user-model';
import { deserializeRoom, serializeRoomWithIncludes } from '../serializers/room.serializer';
import type { JsonApiResourceObject } from '../types/json-api';
import logger from '../utils/logger';

interface PopulatedUser {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  displayName: string;
}

interface RoomQuery {
  isActive: boolean;
  'settings.allowGuests'?: boolean;
  $or?: Array<{
    name?: { $regex: string; $options: string };
    description?: { $regex: string; $options: string };
  }>;
}

const serializeRoomWithCreator = (room: RoomDocument, creator: PopulatedUser) =>
  serializeRoomWithIncludes(room, {
    createdBy: {
      id: String(creator._id),
      type: 'user',
      attributes: {
        firstName: creator.firstName,
        lastName: creator.lastName,
        displayName: creator.displayName,
      },
    },
  });

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

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'User Not Found', detail: 'User not found' }],
      });
    }

    const { name, description, maxPlayers, settings } = deserializeRoom(req.body);

    const room = new RoomModel({
      name,
      description,
      createdBy: userId,
      maxPlayers,
      settings: {
        isPrivate: settings?.isPrivate || false,
        allowGuests: settings?.allowGuests !== false,
        gridSize: settings?.gridSize || 50,
      },
    });

    await room.save();
    await room.populate('createdBy', 'firstName lastName displayName');
    res.status(201).json(serializeRoomWithCreator(room, user as unknown as PopulatedUser));
  } catch (error) {
    logger.error('Error creating room:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to create room' }],
    });
  }
};

export const getRooms = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: RoomQuery = { isActive: true };

    if (!req.userId) {
      query['settings.allowGuests'] = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search as string, $options: 'i' } },
        { description: { $regex: search as string, $options: 'i' } },
      ];
    }

    const roomList = await RoomModel.find(query)
      .populate('createdBy', 'firstName lastName displayName')
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await RoomModel.countDocuments(query);

    const includes: Record<string, JsonApiResourceObject> = {};
    for (const room of roomList) {
      if (room.createdBy && typeof room.createdBy === 'object' && 'firstName' in room.createdBy) {
        const createdByUser = room.createdBy as unknown as PopulatedUser;
        includes[`user-${createdByUser._id}`] = {
          id: String(createdByUser._id),
          type: 'user',
          attributes: {
            firstName: createdByUser.firstName,
            lastName: createdByUser.lastName,
            displayName: createdByUser.displayName,
          },
        };
      }
    }

    const response = serializeRoomWithIncludes(roomList, includes);

    response.meta = {
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching rooms:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to fetch rooms' }],
    });
  }
};

export const getRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    const room = await RoomModel.findOne({ roomId, isActive: true }).populate(
      'createdBy',
      'firstName lastName displayName'
    );

    if (!room) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    }

    if (!req.userId && !room.settings.allowGuests) {
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

    res.json(serializeRoomWithCreator(room, room.createdBy as unknown as PopulatedUser));
  } catch (error) {
    logger.error('Error fetching room:', error);
    res.status(500).json({
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

    const room = await RoomModel.findOne({ roomId, isActive: true });

    if (!room) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    }

    if (room.createdBy.toString() !== userId) {
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

    if (name !== undefined) room.name = name;
    if (description !== undefined) room.description = description;
    if (maxPlayers !== undefined) room.maxPlayers = maxPlayers;
    if (settings !== undefined) room.settings = { ...room.settings, ...settings };

    await room.save();
    await room.populate('createdBy', 'firstName lastName displayName');
    res.json(serializeRoomWithCreator(room, room.createdBy as unknown as PopulatedUser));
  } catch (error) {
    logger.error('Error updating room:', error);
    res.status(500).json({
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

    const room = await RoomModel.findOne({ roomId, isActive: true });

    if (!room) {
      return res.status(404).json({
        errors: [{ status: '404', title: 'Room Not Found', detail: 'Room not found or inactive' }],
      });
    }

    if (room.createdBy.toString() !== userId) {
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

    // Soft delete — room data is preserved for history/audit
    room.isActive = false;
    await room.save();

    res.status(204).json({});
  } catch (error) {
    logger.error('Error deleting room:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to delete room' }],
    });
  }
};
