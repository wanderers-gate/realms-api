import { describe, expect, it } from '@jest/globals';
import { Types } from 'mongoose';
import type { CanvasDocument } from '../../models/canvas-model';
import type { CanvasOperation } from '../../types/canvas';
import {
  deserializeCanvas,
  serializeCanvas,
  serializeCanvasOperations,
} from '../canvas.serializer';

describe('Canvas Serializer', () => {
  const mockUserId = new Types.ObjectId();
  const mockCanvasId = new Types.ObjectId();

  const mockCanvasDoc: Partial<CanvasDocument> = {
    _id: mockCanvasId,
    roomId: 'TEST123',
    operations: [
      {
        id: 'op1',
        type: 'draw',
        tool: 'pen',
        points: [{ x: 10, y: 20 }],
        color: '#000000',
        size: 2,
        timestamp: new Date('2023-01-01T00:00:00Z'),
        userId: 'user123',
      },
    ],
    lastModified: new Date('2023-01-01T12:00:00Z'),
    version: 5,
    createdBy: mockUserId,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    updatedAt: new Date('2023-01-01T12:00:00Z'),
  } as CanvasDocument;

  describe('serializeCanvas', () => {
    it('should serialize a single canvas document', () => {
      const result = serializeCanvas(mockCanvasDoc as CanvasDocument);

      expect(result).toEqual({
        data: {
          id: mockCanvasId.toString(),
          type: 'canvas',
          attributes: {
            roomId: 'TEST123',
            operations: [
              {
                id: 'op1',
                type: 'draw',
                tool: 'pen',
                points: [{ x: 10, y: 20 }],
                color: '#000000',
                size: 2,
                timestamp: new Date('2023-01-01T00:00:00Z'),
                userId: 'user123',
              },
            ],
            lastModified: new Date('2023-01-01T12:00:00Z'),
            version: 5,
            createdAt: new Date('2023-01-01T00:00:00Z'),
            updatedAt: new Date('2023-01-01T12:00:00Z'),
          },
          relationships: {
            createdBy: {
              data: {
                id: mockUserId.toString(),
                type: 'user',
              },
            },
          },
        },
      });
    });

    it('should serialize an array of canvas documents', () => {
      const canvases = [mockCanvasDoc, mockCanvasDoc] as CanvasDocument[];
      const result = serializeCanvas(canvases);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data).toHaveLength(2);
      if (Array.isArray(result.data)) {
        expect(result.data[0]).toHaveProperty('type', 'canvas');
        expect(result.data[1]).toHaveProperty('type', 'canvas');
      }
    });

    it('should handle canvas without relationships', () => {
      const canvasWithoutCreator = {
        _id: mockCanvasId,
        roomId: 'TEST123',
        operations: [],
        lastModified: new Date('2023-01-01T12:00:00Z'),
        version: 5,
        createdAt: new Date('2023-01-01T00:00:00Z'),
        updatedAt: new Date('2023-01-01T12:00:00Z'),
      } as Partial<CanvasDocument> as CanvasDocument;
      const result = serializeCanvas(canvasWithoutCreator);

      expect(result.data).not.toHaveProperty('relationships');
    });
  });

  describe('deserializeCanvas', () => {
    it('should deserialize a JSON:API resource object', () => {
      const jsonApiResource = {
        id: mockCanvasId.toString(),
        type: 'canvas',
        attributes: {
          roomId: 'TEST123',
          operations: [
            {
              id: 'op1',
              type: 'draw',
              tool: 'pen',
              points: [{ x: 10, y: 20 }],
              color: '#000000',
              size: 2,
              timestamp: new Date('2023-01-01T00:00:00Z'),
              userId: 'user123',
            },
          ],
          version: 5,
        },
        relationships: {
          createdBy: {
            data: {
              id: mockUserId.toString(),
              type: 'user',
            },
          },
        },
      };

      const result = deserializeCanvas(jsonApiResource);

      expect(result).toEqual({
        _id: mockCanvasId,
        roomId: 'TEST123',
        operations: [
          {
            id: 'op1',
            type: 'draw',
            tool: 'pen',
            points: [{ x: 10, y: 20 }],
            color: '#000000',
            size: 2,
            timestamp: new Date('2023-01-01T00:00:00Z'),
            userId: 'user123',
          },
        ],
        version: 5,
        createdBy: mockUserId.toString(),
      });
    });

    it('should handle resource without attributes (jsona format)', () => {
      const jsonaResource = {
        id: mockCanvasId.toString(),
        type: 'canvas',
        attributes: {
          roomId: 'TEST123',
          operations: [],
          version: 1,
        },
      };

      const result = deserializeCanvas(jsonaResource);

      expect(result).toEqual({
        _id: mockCanvasId,
        roomId: 'TEST123',
        operations: [],
        version: 1,
      });
    });

    it('should handle resource without relationships', () => {
      const resourceWithoutRelationships = {
        id: mockCanvasId.toString(),
        type: 'canvas',
        attributes: {
          roomId: 'TEST123',
          operations: [],
          version: 1,
        },
      };

      const result = deserializeCanvas(resourceWithoutRelationships);

      expect(result).toEqual({
        _id: mockCanvasId,
        roomId: 'TEST123',
        operations: [],
        version: 1,
      });
      expect(result.createdBy).toBeUndefined();
    });

    it('should handle array relationships correctly', () => {
      const resourceWithArrayRelationship = {
        id: mockCanvasId.toString(),
        type: 'canvas',
        attributes: {
          roomId: 'TEST123',
          operations: [],
        },
        relationships: {
          createdBy: {
            data: [
              { id: 'user1', type: 'user' },
              { id: 'user2', type: 'user' },
            ],
          },
        },
      };

      const result = deserializeCanvas(resourceWithArrayRelationship);

      expect(result.createdBy).toBeUndefined(); // Should ignore array relationships
    });
  });

  describe('serializeCanvasOperations', () => {
    it('should serialize canvas operations for real-time updates', () => {
      const operations: CanvasOperation[] = [
        {
          id: 'op1',
          type: 'draw',
          tool: 'pen',
          points: [{ x: 10, y: 20 }],
          color: '#000000',
          size: 2,
          timestamp: new Date('2023-01-01T00:00:00Z'),
          userId: 'user123',
        },
        {
          id: 'op2',
          type: 'erase',
          tool: 'eraser',
          points: [{ x: 30, y: 40 }],
          color: '#ffffff',
          size: 5,
          timestamp: new Date('2023-01-01T00:01:00Z'),
          userId: 'user456',
        },
      ];

      const result = serializeCanvasOperations(operations);

      expect(result).toEqual({
        data: {
          id: 'operations',
          type: 'canvas-operations',
          attributes: {
            operations,
            count: 2,
            timestamp: expect.any(String),
          },
        },
      });

      // Verify timestamp is a valid ISO string
      if (!Array.isArray(result.data)) {
        const timestamp = result.data.attributes.timestamp as string;
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
      }
    });

    it('should handle empty operations array', () => {
      const result = serializeCanvasOperations([]);

      if (!Array.isArray(result.data)) {
        expect(result.data.attributes.operations).toEqual([]);
        expect(result.data.attributes.count).toBe(0);
      }
    });
  });
});
