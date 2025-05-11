export interface JsonApiResource {
  data: JsonApiResourceObject | JsonApiResourceObject[];
  included?: JsonApiResourceObject[];
}

export interface JsonApiResourceObject {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, JsonApiRelationship>;
}

export interface JsonApiAttributes {
  [key: string]: unknown;
}

export interface JsonApiRelationships {
  [key: string]: JsonApiRelationship;
}

export interface JsonApiRelationship {
  data: JsonApiResourceIdentifier | JsonApiResourceIdentifier[];
}

export interface JsonApiResourceIdentifier {
  type: string;
  id: string;
}

export interface JsonApiError {
  status: string;
  title: string;
  detail: string;
}

export interface JsonApiRequest {
  data: {
    id?: string;
    type: string;
    attributes: Record<string, unknown>;
    relationships?: Record<string, JsonApiRelationship>;
  };
}

export interface JsonApiResponse {
  data: JsonApiResourceObject | JsonApiResourceObject[];
  included?: JsonApiResourceObject[];
  meta?: Record<string, unknown>;
  links?: Record<string, string>;
}
