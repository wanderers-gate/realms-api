import type { InferSelectModel } from 'drizzle-orm';
import type { rooms } from '../db/schema';
import type { JsonApiResourceObject, JsonApiResponse } from '../types/json-api';

export type Room = InferSelectModel<typeof rooms>;

type RoomInput = {
  name?: string;
  description?: string;
  roomCode?: string;
  maxPlayers?: number;
  settings?: {
    isPrivate?: boolean;
    allowGuests?: boolean;
    gridSize?: number;
    gridVisible?: boolean;
    gridType?: string;
    snapToGrid?: boolean;
    gridOpacity?: number;
    canvasWidth?: number;
    canvasHeight?: number;
  };
};

const serializeRoomResource = (room: Room): JsonApiResourceObject => ({
  id: room.id,
  type: 'room',
  attributes: {
    name: room.name,
    description: room.description,
    roomCode: room.roomCode,
    slug: room.slug,
    isActive: room.isActive,
    maxPlayers: room.maxPlayers,
    currentPlayers: room.currentPlayers,
    lastActivity: room.lastActivity,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    settings: {
      isPrivate: room.isPrivate,
      allowGuests: room.allowGuests,
      gridSize: room.gridSize,
      gridVisible: room.gridVisible,
      gridType: room.gridType,
      snapToGrid: room.snapToGrid,
      gridOpacity: room.gridOpacity,
      canvasWidth: room.canvasWidth,
      canvasHeight: room.canvasHeight,
    },
  },
  relationships: {
    createdBy: {
      data: { type: 'user', id: room.createdById },
    },
  },
});

export const serializeRoom = (data: Room | Room[]): JsonApiResponse => ({
  data: Array.isArray(data) ? data.map(serializeRoomResource) : serializeRoomResource(data),
});

export const serializeRoomWithIncludes = (
  data: Room | Room[],
  includes?: Record<string, JsonApiResourceObject>
): JsonApiResponse => {
  const response = serializeRoom(data);
  if (includes && Object.keys(includes).length > 0) {
    response.included = Object.values(includes);
  }
  return response;
};

export const deserializeRoom = (resource: JsonApiResourceObject): RoomInput => {
  const data = (resource.attributes || resource) as Record<string, unknown>;
  const result: RoomInput = {};

  if (data.name !== undefined) result.name = data.name as string;
  if (data.description !== undefined) result.description = data.description as string;
  if (data.roomCode !== undefined) result.roomCode = data.roomCode as string;
  if (data.maxPlayers !== undefined) result.maxPlayers = data.maxPlayers as number;
  if (data.settings !== undefined) result.settings = data.settings as RoomInput['settings'];

  return result;
};
