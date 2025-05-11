import type { JsonApiError } from './json-api';
import type { UserDocument } from '../models/user-model';

declare global {
  namespace Express {
    interface Response {
      jsonApiError: (_status: number, _errors: JsonApiError[]) => void;
    }
    interface Request {
      user?: UserDocument;
    }
  }
}
