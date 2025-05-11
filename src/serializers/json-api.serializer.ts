import type {
  JsonApiAttributes,
  JsonApiRelationships,
  JsonApiResourceObject,
  JsonApiResponse,
} from '../types/json-api';

export abstract class JsonApiSerializer<T extends Record<string, unknown>> {
  protected abstract type: string;
  protected abstract idField: keyof T;
  protected abstract attributes: (keyof T)[];
  protected abstract relationships: Record<string, string>;

  public serialize(data: T | T[]): JsonApiResponse {
    const resources = Array.isArray(data)
      ? data.map((item) => this.serializeResource(item))
      : this.serializeResource(data);

    return {
      data: resources,
    };
  }

  public deserialize(resource: JsonApiResourceObject): Partial<T> {
    const result: Partial<T> = {};

    // Handle ID
    if (resource.id) {
      result[this.idField] = resource.id as T[keyof T];
    }

    // Handle attributes
    if (resource.attributes) {
      for (const [key, value] of Object.entries(resource.attributes)) {
        if (this.attributes.includes(key as keyof T)) {
          result[key as keyof T] = value as T[keyof T];
        }
      }
    }

    // Handle relationships
    if (resource.relationships) {
      for (const [key, value] of Object.entries(resource.relationships)) {
        const relationshipType = this.relationships[key];
        if (relationshipType) {
          result[key as keyof T] = value as T[keyof T];
        }
      }
    }

    return result;
  }

  protected serializeResource(data: T): JsonApiResourceObject {
    const attributes = this.attributes.reduce(
      (acc, key) => {
        if (key in data) {
          acc[key as string] = data[key];
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

    const resource: JsonApiResourceObject = {
      type: this.type,
      id: String(data[this.idField]),
      attributes,
    };

    const relationships = this.serializeRelationships(data);
    if (Object.keys(relationships).length > 0) {
      resource.relationships = relationships;
    }

    return resource;
  }

  protected serializeAttributes(item: T): JsonApiAttributes {
    const attributes: JsonApiAttributes = {};
    for (const key of this.attributes) {
      if (item[key] !== undefined) {
        attributes[key as string] = item[key];
      }
    }
    return attributes;
  }

  protected serializeRelationships(item: T): JsonApiRelationships {
    const relationships: JsonApiRelationships = {};
    for (const [key, type] of Object.entries(this.relationships)) {
      if (item[key as keyof T] !== undefined) {
        relationships[key] = {
          data: {
            type,
            id: item[key as keyof T] as string,
          },
        };
      }
    }
    return relationships;
  }
}
