import { describe, expect, it } from '@jest/globals';
import type { InferSelectModel } from 'drizzle-orm';
import type { canvasOperations, canvases } from '../../db/schema';
import type { CanvasOperation } from '../../types/canvas';
import {
  deserializeCanvas,
  serializeCanvas,
  serializeCanvasOperations,
} from '../canvas.serializer';

type Canvas = InferSelectModel<typeof canvases>;
type CanvasOp = InferSelectModel<typeof canvasOperations>;

describe('Canvas Serializer', () => {
  const mockCanvas: Canvas = {
    id: 'canvas-uuid-123',
    roomId: 'room-uuid-456',
    lastModified: new Date('2023-01-01T12:00:00Z'),
    version: 5,
    createdById: 'user-uuid-789',
    createdAt: new Date('2023-01-01T00:00:00Z'),
    updatedAt: new Date('2023-01-01T12:00:00Z'),
  };

  const mockOps: CanvasOp[] = [
    {
      id: 'row-id-1',
      canvasId: 'canvas-uuid-123',
      opId: 'op1',
      type: 'draw',
      tool: 'pen',
      points: [{ x: 10, y: 20 }],
      color: '#000000',
      size: 2,
      userId: 'user123',
      timestamp: new Date('2023-01-01T00:00:00Z'),
    },
  ];

  describe('serializeCanvas', () => {
    it('should serialize a canvas with its operations', () => {
      const result = serializeCanvas(mockCanvas, mockOps);

      expect(result).toEqual({
        data: {
          id: 'canvas-uuid-123',
          type: 'canvas',
          attributes: {
            roomId: 'room-uuid-456',
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
              data: { id: 'user-uuid-789', type: 'user' },
            },
          },
        },
      });
    });

    it('should serialize a canvas with no operations', () => {
      const result = serializeCanvas(mockCanvas, []);

      if (!Array.isArray(result.data)) {
        expect(result.data.attributes.operations).toEqual([]);
      }
    });
  });

  describe('deserializeCanvas', () => {
    it('should extract operations from attributes', () => {
      const resource = {
        id: 'canvas-uuid-123',
        type: 'canvas',
        attributes: {
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
        },
      };

      const result = deserializeCanvas(resource);

      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].id).toBe('op1');
    });

    it('should return undefined operations when none present', () => {
      const result = deserializeCanvas({ id: 'x', type: 'canvas', attributes: {} });
      expect(result.operations).toBeUndefined();
    });

    it('should return empty array for empty operations', () => {
      const result = deserializeCanvas({ id: 'x', type: 'canvas', attributes: { operations: [] } });
      expect(result.operations).toEqual([]);
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
      ];

      const result = serializeCanvasOperations(operations);

      expect(result).toEqual({
        data: {
          id: 'operations',
          type: 'canvas-operations',
          attributes: {
            operations,
            count: 1,
            timestamp: expect.any(String),
          },
        },
      });

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
