import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { type Room, RoomModel } from '../models/room-model';
import { UserModel } from '../models/user-model';
import { deserializeRoom, serializeRoom, serializeRoomWithIncludes } from '../serializers/room.serializer';
import type { JsonApiResourceObject } from '../types/json-api';

// Type for populated user data
interface PopulatedUser {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  displayName: string;
}

// Type for MongoDB query
interface RoomQuery {
  isActive: boolean;
  'settings.allowGuests'?: boolean;
  $or?: Array<{
    name?: { $regex: string; $options: string };
    description?: { $regex: string; $options: string };
  }>;
}

// Create a new room
export const createRoom = async (req: Request, res: Response) => {
  try {
    // Handle the case where middleware might not have processed the request yet
    let attributes: Record<string, unknown>;
    if (req.body.data?.attributes) {
      // Full JSON:API format - extract attributes
      attributes = req.body.data.attributes;
    } else {
      // Already processed by middleware
      attributes = req.body;
    }
    
    const jsonApiResource = {
      type: 'room',
      id: '', // Will be ignored for creation
      attributes,
    };
    const deserializedData = deserializeRoom(jsonApiResource);
    const { name, description, maxPlayers, settings } = deserializedData;
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

    // Verify user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'User Not Found',
            detail: 'User not found',
          },
        ],
      });
    }

    const roomData = {
      name,
      description,
      createdBy: userId,
      maxPlayers,
      settings: {
        isPrivate: settings?.isPrivate || false,
        allowGuests: settings?.allowGuests !== false, // Default to true
        gridSize: settings?.gridSize || 50,
      },
    };

    const room = new RoomModel(roomData);
    await room.save();

    // Populate creator information
    await room.populate('createdBy', 'firstName lastName displayName');

    const response = serializeRoomWithIncludes(room, {
      createdBy: {
        id: String(user._id),
        type: 'user',
        attributes: {
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
        },
      },
    });

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to create room',
        },
      ],
    });
  }
};

// Get all public rooms
export const getRooms = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: RoomQuery = { isActive: true };

    // If user is not authenticated, only show rooms that allow guests
    if (!req.userId) {
      query['settings.allowGuests'] = true;
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search as string, $options: 'i' } },
        { description: { $regex: search as string, $options: 'i' } },
      ];
    }

    const rooms = await RoomModel.find(query)
      .populate('createdBy', 'firstName lastName displayName')
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await RoomModel.countDocuments(query);

    // Include the populated createdBy user data for each room
    const includes: Record<string, JsonApiResourceObject> = {};
    for (const room of rooms) {
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

    const response = serializeRoomWithIncludes(rooms, includes);

    // Add pagination metadata
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
    console.error('Error fetching rooms:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to fetch rooms',
        },
      ],
    });
  }
};

// Get a specific room by roomId
export const getRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    const room = await RoomModel.findOne({ roomId, isActive: true }).populate(
      'createdBy',
      'firstName lastName displayName'
    );

    if (!room) {
      return res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
    }

    // Check if user can access the room
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

    // Include the populated createdBy user data
    const createdByUser = room.createdBy as unknown as PopulatedUser;
    const response = serializeRoomWithIncludes(room, {
      createdBy: {
        id: String(createdByUser._id),
        type: 'user',
        attributes: {
          firstName: createdByUser.firstName,
          lastName: createdByUser.lastName,
          displayName: createdByUser.displayName,
        },
      },
    });

    res.json(response);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to fetch room',
        },
      ],
    });
  }
};

// Update room (only by creator)
export const updateRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;
    
    // Handle the case where middleware might not have processed the request yet
    let attributes: Record<string, unknown>;
    if (req.body.data?.attributes) {
      // Full JSON:API format - extract attributes
      attributes = req.body.data.attributes;
    } else {
      // Already processed by middleware
      attributes = req.body;
    }
    
    const jsonApiResource = {
      type: 'room',
      id: '', // Will be ignored for updates
      attributes,
    };
    const deserializedData = deserializeRoom(jsonApiResource);
    const { name, description, maxPlayers, settings } = deserializedData;

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
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
    }

    // Check if user is the creator
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

    // Update fields
    if (name !== undefined) room.name = name;
    if (description !== undefined) room.description = description;
    if (maxPlayers !== undefined) room.maxPlayers = maxPlayers;
    if (settings !== undefined) {
      room.settings = { ...room.settings, ...settings };
    }

    await room.save();
    await room.populate('createdBy', 'firstName lastName displayName');

    // Include the populated createdBy user data
    const createdByUser = room.createdBy as unknown as PopulatedUser;
    const response = serializeRoomWithIncludes(room, {
      createdBy: {
        id: String(createdByUser._id),
        type: 'user',
        attributes: {
          firstName: createdByUser.firstName,
          lastName: createdByUser.lastName,
          displayName: createdByUser.displayName,
        },
      },
    });

    res.json(response);
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to update room',
        },
      ],
    });
  }
};

// Delete room (only by creator)
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
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
    }

    // Check if user is the creator
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

    // Soft delete by setting isActive to false
    room.isActive = false;
    await room.save();

    res.status(204).json({});
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to delete room',
        },
      ],
    });
  }
};

// Update player count (for socket connections)
export const updatePlayerCount = async (roomId: string, increment: boolean) => {
  try {
    const room = await RoomModel.findOne({ roomId, isActive: true });
    if (!room) return false;

    if (increment) {
      if (room.currentPlayers < (room.maxPlayers || 10)) {
        room.currentPlayers += 1;
      } else {
        return false; // Room is full
      }
    } else {
      if (room.currentPlayers > 0) {
        room.currentPlayers -= 1;
      }
    }

    await room.save();
    return true;
  } catch (error) {
    console.error('Error updating player count:', error);
    return false;
  }
};
