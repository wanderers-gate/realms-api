export interface Point {
  x: number;
  y: number;
}

export interface CanvasOperation {
  id: string;
  type: 'draw' | 'erase' | 'clear';
  tool: string;
  points: Point[];
  color: string;
  size: number;
  alpha?: number;
  fill?: boolean;
  rotation?: number;
  timestamp: Date;
  userId: string;
}

export interface DrawingEvent {
  type: 'draw' | 'erase' | 'clear';
  roomId: string;
  userId: string;
  tool: string;
  points: Point[];
  color: string;
  size: number;
  alpha?: number;
  fill?: boolean;
  rotation?: number;
}

export interface CanvasState {
  roomId: string;
  operations: CanvasOperation[];
  lastModified: Date;
  version: number;
}
