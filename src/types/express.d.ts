import type { InferSelectModel } from 'drizzle-orm';
import type { users } from '../db/schema';
import type { JsonApiError } from './json-api';

export type User = InferSelectModel<typeof users>;

declare global {
  namespace Express {
    interface Response {
      jsonApiError: (_status: number, _errors: JsonApiError[]) => void;
    }
    interface Request {
      user?: User;
    }
  }
}

declare module 'socket.io' {
  interface Socket {
    username?: string;
  }
}
