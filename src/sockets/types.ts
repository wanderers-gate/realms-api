import type { DiceRollResult } from './helpers/dice';

export type { DiceRollResult };

export interface Token {
  id: string;
  roomId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
  ownerId: string;
  ownerIds: string[];
  imageUrl?: string;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  visible: boolean;
  hp: number;
  maxHp: number;
  conditions: string[];
  initiative: number;
}

export interface RoomUser {
  id: string;
  authenticatedUserId?: string;
  username: string;
  joinedAt: Date;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  diceRoll?: DiceRollResult;
}

export interface RoomState {
  users: Map<string, RoomUser>;
  messages: ChatMessage[];
}

export interface PingEvent {
  id: string;
  x: number;
  y: number;
  userId: string;
  username: string;
  color: string;
}
