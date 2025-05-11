import type { JsonApiError } from './json-api';

declare global {
  namespace Express {
    interface Response {
      jsonApiError: (_status: number, _errors: JsonApiError[]) => void;
    }
  }
}
