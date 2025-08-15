import { describe, it, expect } from '@jest/globals';
import { Types } from 'mongoose';
import { serializeRoom, deserializeRoom, serializeRoomWithIncludes } from '../room.serializer';
import type { RoomDocument } from '../../models/room-model';
import type { JsonApiResponse, JsonApiResourceObject } from '../../types/json-api';

// Helper function to safely access array data
const getArrayData = (response: JsonApiResponse): JsonApiResourceObject[] => {
  if (Array.isArray(response.data)) {
    return response.data;
  }
  throw new Error('Expected array data');
};

// Helper function to safely access single data
const getSingleData = (response: JsonApiResponse): JsonApiResourceObject => {
  if (!Array.isArray(response.data)) {
    return response.data;
  }
  throw new Error('Expected single data');
};

describe('Room Serializer', () => {
  const mockRoom: Partial<RoomDocument> = {
    _id: new Types.ObjectId(),
    name: 'Test Room',
    description: 'A test room for testing',
    roomId: 'ABC123',
    createdBy: new Types.ObjectId(),
    isActive: true,
    maxPlayers: 5,
    currentPlayers: 2,
    settings: {
      isPrivate: false,
      allowGuests: true,
      gridSize: 50,
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastActivity: new Date('2024-01-01'),
  };

  describe('serializeRoom', () => {
    it('should serialize a single room', () => {
      const result = serializeRoom(mockRoom as RoomDocument);

      expect(result).toEqual({
        data: {
          type: 'room',
          id: mockRoom._id?.toString(),
          attributes: {
            name: mockRoom.name,
            description: mockRoom.description,
            roomId: mockRoom.roomId,
            isActive: mockRoom.isActive,
            maxPlayers: mockRoom.maxPlayers,
            currentPlayers: mockRoom.currentPlayers,
            settings: mockRoom.settings,
            createdAt: mockRoom.createdAt,
            updatedAt: mockRoom.updatedAt,
            lastActivity: mockRoom.lastActivity,
          },
          relationships: {
            createdBy: {
              data: {
                type: 'user',
                id: mockRoom.createdBy?.toString(),
              },
            },
          },
        },
      });
    });

    it('should serialize multiple rooms', () => {
      const mockRoom2 = { ...mockRoom, _id: new Types.ObjectId(), name: 'Test Room 2' };
      const result = serializeRoom([mockRoom, mockRoom2] as RoomDocument[]);

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(2);
      
      const arrayData = getArrayData(result);
      expect(arrayData[0].type).toBe('room');
      expect(arrayData[1].type).toBe('room');
      expect(arrayData[0].attributes.name).toBe('Test Room');
      expect(arrayData[1].attributes.name).toBe('Test Room 2');
    });

    it('should handle populated createdBy relationship', () => {
      const populatedRoom = {
        ...mockRoom,
        createdBy: {
          _id: new Types.ObjectId(),
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
        },
      };

      const result = serializeRoom(populatedRoom as unknown as RoomDocument);
      const singleData = getSingleData(result);

      const createdByData = singleData.relationships?.createdBy.data;
      if (createdByData && !Array.isArray(createdByData)) {
        expect(createdByData.id).toBe(populatedRoom.createdBy._id.toString());
      } else {
        throw new Error('Expected single createdBy data');
      }
    });

    it('should not include relationships when createdBy is not present', () => {
      const roomWithoutCreatedBy = { ...mockRoom };
      roomWithoutCreatedBy.createdBy = undefined;

      const result = serializeRoom(roomWithoutCreatedBy as RoomDocument);
      const singleData = getSingleData(result);

      expect(singleData.relationships).toBeUndefined();
    });
  });

  describe('serializeRoomWithIncludes', () => {
    it('should serialize room with included data', () => {
      const includes = {
        createdBy: {
          id: 'user123',
          type: 'user',
          attributes: {
            firstName: 'John',
            lastName: 'Doe',
            displayName: 'John Doe',
          },
        },
      };

      const result = serializeRoomWithIncludes(mockRoom as RoomDocument, includes);
      const singleData = getSingleData(result);

      expect(singleData.type).toBe('room');
      expect(result.included).toEqual([includes.createdBy]);
    });

    it('should serialize room without includes when not provided', () => {
      const result = serializeRoomWithIncludes(mockRoom as RoomDocument);
      const singleData = getSingleData(result);

      expect(singleData.type).toBe('room');
      expect(result.included).toBeUndefined();
    });
  });

  describe('deserializeRoom', () => {
    it('should deserialize room resource', () => {
      const resource = {
        type: 'room',
        id: 'room123',
        attributes: {
          name: 'Test Room',
          description: 'A test room',
          maxPlayers: 5,
          settings: {
            isPrivate: false,
            allowGuests: true,
            gridSize: 50,
          },
        },
        relationships: {
          createdBy: {
            data: {
              type: 'user',
              id: '507f1f77bcf86cd799439011',
            },
          },
        },
      };

      const result = deserializeRoom(resource);

      expect(result.name).toBe('Test Room');
      expect(result.description).toBe('A test room');
      expect(result.maxPlayers).toBe(5);
      expect(result.settings).toEqual({
        isPrivate: false,
        allowGuests: true,
        gridSize: 50,
      });
      expect(result.createdBy).toBeInstanceOf(Types.ObjectId);
      expect(result.createdBy?.toString()).toBe('507f1f77bcf86cd799439011');
    });

    it('should handle room without relationships', () => {
      const resource = {
        type: 'room',
        id: 'room123',
        attributes: {
          name: 'Test Room',
          description: 'A test room',
        },
      };

      const result = deserializeRoom(resource);

      expect(result.name).toBe('Test Room');
      expect(result.description).toBe('A test room');
      expect(result.createdBy).toBeUndefined();
    });

    it('should handle room with createdBy in attributes', () => {
      const resource = {
        type: 'room',
        id: 'room123',
        attributes: {
          name: 'Test Room',
          createdBy: 'user123',
        },
      };

      const result = deserializeRoom(resource);

      expect(result.name).toBe('Test Room');
      expect(result.createdBy).toBe('user123');
    });
  });
});
