import { Types } from 'mongoose';
import type { UserDocument } from '../models/user-model';
import type { JsonApiResourceObject, JsonApiResponse } from '../types/json-api';

const type = 'user';
const idField = '_id';
const attributes = [
  'email',
  'firstName',
  'lastName',
  'displayName',
  'createdAt',
  'updatedAt',
] as const;

export const serializeUser = (data: UserDocument | UserDocument[]): JsonApiResponse => {
  const resources = Array.isArray(data)
    ? data.map((item) => serializeUserResource(item))
    : serializeUserResource(data);

  return {
    data: resources,
  };
};

const serializeUserResource = (data: UserDocument): JsonApiResourceObject => {
  const resourceAttributes = attributes.reduce<Record<string, unknown>>((acc, key) => {
    if (key in data) {
      acc[key] = data[key];
    }
    return acc;
  }, {});

  return {
    id: String(data[idField]),
    type,
    attributes: resourceAttributes,
  };
};

export const deserializeUser = (resource: JsonApiResourceObject): Partial<UserDocument> => {
  const result: Partial<UserDocument> = {};

  if (resource.id) {
    result[idField] = new Types.ObjectId(resource.id);
  }

  // Handle jsona format where data is directly in the resource object
  // or standard JSON:API format where data is in attributes
  const dataToProcess = resource.attributes || resource;

  for (const [key, value] of Object.entries(dataToProcess)) {
    if (attributes.includes(key as (typeof attributes)[number])) {
      result[key as keyof UserDocument] = value as UserDocument[keyof UserDocument];
    }
  }

  return result;
};
