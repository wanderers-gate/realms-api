import { describe, expect, it } from '@jest/globals';
import type { JsonApiResourceObject, JsonApiResponse } from '../../types/json-api';
import type { Room } from '../room.serializer';
import { deserializeRoom, serializeRoom, serializeRoomWithIncludes } from '../room.serializer';

const getArrayData = (response: JsonApiResponse): JsonApiResourceObject[] => {
  if (Array.isArray(response.data)) return response.data;
  throw new Error('Expected array data');
};

const getSingleData = (response: JsonApiResponse): JsonApiResourceObject => {
  if (!Array.isArray(response.data)) return response.data;
  throw new Error('Expected single data');
};

describe('Room Serializer', () => {
  const mockRoom: Room = {
    id: 'room-uuid-123',
    name: 'Test Room',
    slug: 'test-room',
    description: 'A test room for testing',
    roomCode: 'ABC123',
    createdById: 'user-uuid-456',
    isActive: true,
    maxPlayers: 5,
    currentPlayers: 2,
    lastActivity: new Date('2024-01-01'),
    isPrivate: false,
    allowGuests: true,
    gridSize: 50,
    gridVisible: true,
    gridType: 'square',
    snapToGrid: false,
    gridOpacity: 0.6,
    canvasWidth: 3000,
    canvasHeight: 2000,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  describe('serializeRoom', () => {
    it('should serialize a single room', () => {
      const result = serializeRoom(mockRoom);
      const singleData = getSingleData(result);

      expect(singleData.type).toBe('room');
      expect(singleData.id).toBe('room-uuid-123');
      expect(singleData.attributes.name).toBe('Test Room');
      expect(singleData.attributes.roomCode).toBe('ABC123');
      expect(singleData.attributes.slug).toBe('test-room');
      expect(singleData.attributes.isActive).toBe(true);
      expect(singleData.attributes.maxPlayers).toBe(5);
      expect(singleData.attributes.currentPlayers).toBe(2);
    });

    it('should reconstruct settings as nested object', () => {
      const result = serializeRoom(mockRoom);
      const singleData = getSingleData(result);

      expect(singleData.attributes.settings).toEqual({
        isPrivate: false,
        allowGuests: true,
        gridSize: 50,
        gridVisible: true,
        gridType: 'square',
        snapToGrid: false,
        gridOpacity: 0.6,
        canvasWidth: 3000,
        canvasHeight: 2000,
      });
    });

    it('should include createdBy relationship', () => {
      const result = serializeRoom(mockRoom);
      const singleData = getSingleData(result);

      expect(singleData.relationships?.createdBy.data).toEqual({
        type: 'user',
        id: 'user-uuid-456',
      });
    });

    it('should serialize multiple rooms', () => {
      const mockRoom2: Room = {
        ...mockRoom,
        id: 'room-uuid-789',
        name: 'Test Room 2',
        slug: 'test-room-2',
        roomCode: 'DEF456',
      };
      const result = serializeRoom([mockRoom, mockRoom2]);

      expect(Array.isArray(result.data)).toBe(true);
      const arrayData = getArrayData(result);
      expect(arrayData).toHaveLength(2);
      expect(arrayData[0].attributes.name).toBe('Test Room');
      expect(arrayData[1].attributes.name).toBe('Test Room 2');
    });
  });

  describe('serializeRoomWithIncludes', () => {
    it('should serialize room with included user data', () => {
      const includes: Record<string, JsonApiResourceObject> = {
        'user-user-uuid-456': {
          id: 'user-uuid-456',
          type: 'user',
          attributes: { firstName: 'John', lastName: 'Doe', displayName: 'John Doe' },
        },
      };

      const result = serializeRoomWithIncludes(mockRoom, includes);

      expect(getSingleData(result).type).toBe('room');
      expect(result.included).toHaveLength(1);
      expect(result.included?.[0].type).toBe('user');
      expect(result.included?.[0].id).toBe('user-uuid-456');
    });

    it('should not add included when not provided', () => {
      const result = serializeRoomWithIncludes(mockRoom);

      expect(result.included).toBeUndefined();
    });
  });

  describe('deserializeRoom', () => {
    it('should deserialize room from JSON:API attributes', () => {
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
      };

      const result = deserializeRoom(resource);

      expect(result.name).toBe('Test Room');
      expect(result.description).toBe('A test room');
      expect(result.maxPlayers).toBe(5);
      expect(result.settings).toEqual({ isPrivate: false, allowGuests: true, gridSize: 50 });
    });

    it('should handle flat body without JSON:API envelope', () => {
      const resource = {
        name: 'Test Room',
        description: 'A test room',
        maxPlayers: 8,
      };

      const result = deserializeRoom(resource as unknown as JsonApiResourceObject);

      expect(result.name).toBe('Test Room');
      expect(result.description).toBe('A test room');
      expect(result.maxPlayers).toBe(8);
    });

    it('should return empty object when no fields provided', () => {
      const result = deserializeRoom({} as unknown as JsonApiResourceObject);

      expect(result.name).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.settings).toBeUndefined();
    });
  });
});
