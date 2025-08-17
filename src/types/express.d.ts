import type { Socket as SocketIOSocket } from 'socket.io';
import type { UserDocument } from '../models/user-model';
import type { JsonApiError } from './json-api';

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

declare module 'socket.io' {
  interface Socket {
    username?: string;
  }
}
