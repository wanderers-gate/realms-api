export interface Point {
  x: number;
  y: number;
}

export interface CanvasOperation {
  id: string;
  type: 'draw' | 'erase' | 'clear';
  tool: 'pen' | 'eraser';
  points: Point[];
  color: string;
  size: number;
  timestamp: Date;
  userId: string;
}

export interface DrawingEvent {
  type: 'draw' | 'erase' | 'clear';
  roomId: string;
  userId: string;
  tool: 'pen' | 'eraser';
  points: Point[];
  color: string;
  size: number;
}

export interface CanvasState {
  roomId: string;
  operations: CanvasOperation[];
  lastModified: Date;
  version: number; // For conflict resolution
}
