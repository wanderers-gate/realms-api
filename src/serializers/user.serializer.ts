import type { User } from '../types/express';
import type { JsonApiResourceObject, JsonApiResponse } from '../types/json-api';

const type = 'user';
const attributes = ['username', 'displayName', 'role', 'createdAt', 'updatedAt'] as const;

export const serializeUser = (data: User | User[]): JsonApiResponse => {
  const resources = Array.isArray(data)
    ? data.map(serializeUserResource)
    : serializeUserResource(data);
  return { data: resources };
};

const serializeUserResource = (data: User): JsonApiResourceObject => {
  const resourceAttributes = attributes.reduce<Record<string, unknown>>((acc, key) => {
    if (key in data) acc[key] = data[key as keyof User];
    return acc;
  }, {});
  return { id: data.id, type, attributes: resourceAttributes };
};

export const deserializeUser = (resource: JsonApiResourceObject): Partial<User> => {
  const result: Partial<User> = {};
  const dataToProcess = resource.attributes || resource;

  for (const [key, value] of Object.entries(dataToProcess)) {
    if (attributes.includes(key as (typeof attributes)[number])) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
};
