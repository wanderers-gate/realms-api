import { eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db';
import { initiativeTrackers, rooms } from '../db/schema';
import logger from '../utils/logger';

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  color: string;
  isPlayer: boolean;
  isDead: boolean;
  conditions: string[];
}

export interface InitiativeState {
  round: number;
  visibleToPlayers: boolean;
  activeIndex: number;
  combatants: Combatant[];
}

const EMPTY_STATE: InitiativeState = {
  round: 1,
  visibleToPlayers: false,
  activeIndex: 0,
  combatants: [],
};

async function isGM(roomId: string, authenticatedUserId: string | undefined): Promise<boolean> {
  if (!authenticatedUserId) return false;
  const room = await db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
  return room?.createdById === authenticatedUserId;
}

export async function loadInitiativeState(roomId: string): Promise<InitiativeState> {
  try {
    const row = await db.query.initiativeTrackers.findFirst({
      where: eq(initiativeTrackers.roomId, roomId),
    });
    if (!row) return EMPTY_STATE;
    return (row.state as InitiativeState) ?? EMPTY_STATE;
  } catch (error) {
    logger.error(`[INITIATIVE] Error loading state for room ${roomId}:`, error);
    return EMPTY_STATE;
  }
}

export function registerInitiativeHandlers(socket: Socket, io: Server): void {
  socket.on(
    'initiative-update',
    async (data: { roomId: string; state: InitiativeState }) => {
      try {
        const gmCheck = await isGM(data.roomId, socket.authenticatedUserId);
        if (!gmCheck) return;

        await db
          .insert(initiativeTrackers)
          .values({ roomId: data.roomId, state: data.state })
          .onConflictDoUpdate({
            target: initiativeTrackers.roomId,
            set: { state: data.state, updatedAt: new Date() },
          });

        io.to(data.roomId).emit('initiative-updated', data.state);
        logger.info(`[INITIATIVE] Updated state for room ${data.roomId}`);
      } catch (error) {
        logger.error(`[INITIATIVE] Error updating state for room ${data.roomId}:`, error);
      }
    }
  );
}
