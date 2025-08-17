import type { Types } from 'mongoose';
import type { CanvasDocument } from '../models/canvas-model';
import type { CanvasOperation } from '../types/canvas';
import type { JsonApiResourceObject, JsonApiResponse } from '../types/json-api';

const type = 'canvas';
const attributes = [
  'roomId',
  'operations',
  'lastModified',
  'version',
  'createdAt',
  'updatedAt',
] as const;

export const serializeCanvas = (data: CanvasDocument | CanvasDocument[]): JsonApiResponse => {
  if (Array.isArray(data)) {
    return {
      data: data.map((item) => serializeCanvasResource(item)),
    };
  }

  return {
    data: serializeCanvasResource(data),
  };
};

const serializeCanvasResource = (data: CanvasDocument): JsonApiResourceObject => {
  const resource: JsonApiResourceObject = {
    id: String(data._id),
    type,
    attributes: {},
  };

  // Add attributes
  for (const attr of attributes) {
    if (data[attr] !== undefined) {
      resource.attributes[attr] = data[attr];
    }
  }

  // Add relationships
  if (data.createdBy) {
    resource.relationships = {
      createdBy: {
        data: {
          id: String(data.createdBy),
          type: 'user',
        },
      },
    };
  }

  return resource;
};

export const deserializeCanvas = (resource: JsonApiResourceObject): Partial<CanvasDocument> => {
  const result: Partial<CanvasDocument> = {};

  if (resource.id) {
    result._id = resource.id as string;
  }

  // Handle data from resource or resource.attributes
  const dataToProcess = resource.attributes || resource;

  for (const [key, value] of Object.entries(dataToProcess)) {
    if (attributes.includes(key as (typeof attributes)[number])) {
      result[key as keyof CanvasDocument] = value as unknown;
    }
  }

  // Handle relationships
  if (
    resource.relationships?.createdBy?.data &&
    !Array.isArray(resource.relationships.createdBy.data)
  ) {
    result.createdBy = resource.relationships.createdBy.data.id as unknown as Types.ObjectId;
  }

  return result;
};

// Serialize just the operations for real-time updates
export const serializeCanvasOperations = (operations: CanvasOperation[]): JsonApiResponse => {
  return {
    data: {
      id: 'operations',
      type: 'canvas-operations',
      attributes: {
        operations,
        count: operations.length,
        timestamp: new Date().toISOString(),
      },
    },
  };
};
