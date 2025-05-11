import type {
  JsonApiRelationship,
  JsonApiRequest,
  JsonApiResourceIdentifier,
  JsonApiResourceObject,
  JsonApiResponse,
} from '../types/json-api';

type JsonApiAttributes = Record<string, unknown>;
type JsonApiRelationships = Record<string, JsonApiRelationship>;

interface RelationshipData {
  id: string;
  type: string;
}

export const toJsonApiResource = <T extends JsonApiAttributes>(
  data: T,
  type: string,
  idField: keyof T = 'id' as keyof T,
  relationships: Record<string, RelationshipData | RelationshipData[]> = {}
): JsonApiResourceObject => {
  const id = String(data[idField]);
  const attributes = { ...data };
  delete attributes[idField];

  return {
    id,
    type,
    attributes,
    relationships: Object.entries(relationships).reduce((acc, [key, value]) => {
      if (value) {
        const resourceIdentifier: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] =
          Array.isArray(value)
            ? value.map((item) => ({ id: String(item.id), type: key }))
            : { id: String(value.id), type: key };

        acc[key] = {
          data: resourceIdentifier,
        };
      }
      return acc;
    }, {} as JsonApiRelationships),
  };
};

export const toJsonApiResponse = <T extends JsonApiAttributes>(
  data: T | T[],
  type: string,
  idField: keyof T = 'id' as keyof T,
  relationships: Record<string, RelationshipData | RelationshipData[]> = {}
): JsonApiResponse => {
  const resources = Array.isArray(data)
    ? data.map((item) => toJsonApiResource(item, type, idField, relationships))
    : toJsonApiResource(data, type, idField, relationships);

  return {
    data: resources,
  };
};

export const fromJsonApiRequest = <T extends JsonApiAttributes>(
  request: JsonApiRequest
): Partial<T> => {
  return {
    ...request.data.attributes,
    id: request.data.id,
  } as unknown as Partial<T>;
};
