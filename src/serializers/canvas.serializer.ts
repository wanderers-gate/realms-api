import type { InferSelectModel } from 'drizzle-orm';
import type { canvasOperations, canvases } from '../db/schema';
import type { CanvasOperation } from '../types/canvas';
import type { JsonApiResourceObject, JsonApiResponse } from '../types/json-api';

type Canvas = InferSelectModel<typeof canvases>;
type CanvasOp = InferSelectModel<typeof canvasOperations>;

export interface DeserializedCanvas {
  operations?: CanvasOperation[];
}

export const serializeCanvas = (canvas: Canvas, operations: CanvasOp[]): JsonApiResponse => ({
  data: {
    id: canvas.id,
    type: 'canvas',
    attributes: {
      roomId: canvas.roomId,
      operations: operations.map((op) => ({
        id: op.opId,
        type: op.type,
        tool: op.tool,
        points: op.points,
        color: op.color,
        size: op.size,
        timestamp: op.timestamp,
        userId: op.userId,
      })),
      lastModified: canvas.lastModified,
      version: canvas.version,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
    },
    relationships: {
      createdBy: {
        data: { id: canvas.createdById, type: 'user' },
      },
    },
  },
});

export const deserializeCanvas = (resource: JsonApiResourceObject): DeserializedCanvas => {
  const data = (resource.attributes || resource) as Record<string, unknown>;
  return {
    operations: Array.isArray(data.operations)
      ? (data.operations as CanvasOperation[])
      : undefined,
  };
};

export const serializeCanvasOperations = (operations: CanvasOperation[]): JsonApiResponse => ({
  data: {
    id: 'operations',
    type: 'canvas-operations',
    attributes: {
      operations,
      count: operations.length,
      timestamp: new Date().toISOString(),
    },
  },
});
