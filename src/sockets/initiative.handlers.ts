import { eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db';
import { initiativeTrackers, rooms, tokens } from '../db/schema';
import logger from '../utils/logger';

export interface Combatant {
  id: string;
  tokenId?: string;
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

async function saveInitiativeState(roomId: string, state: InitiativeState): Promise<void> {
  await db
    .insert(initiativeTrackers)
    .values({ roomId, state })
    .onConflictDoUpdate({
      target: initiativeTrackers.roomId,
      set: { state, updatedAt: new Date() },
    });
}

async function isTokenOwnerOrGM(
  roomId: string,
  tokenId: string,
  authenticatedUserId: string | undefined
): Promise<boolean> {
  if (!authenticatedUserId) return false;
  if (await isGM(roomId, authenticatedUserId)) return true;
  const token = await db.query.tokens.findFirst({ where: eq(tokens.tokenId, tokenId) });
  if (!token) return false;
  const ownerIds = (token.ownerIds as string[]) ?? (token.ownerId ? [token.ownerId] : []);
  return ownerIds.includes(authenticatedUserId);
}

export function registerInitiativeHandlers(socket: Socket, io: Server): void {
  socket.on('initiative-update', async (data: { roomId: string; state: InitiativeState }) => {
    try {
      const gmCheck = await isGM(data.roomId, socket.authenticatedUserId);
      if (!gmCheck) return;

      await saveInitiativeState(data.roomId, data.state);
      io.to(data.roomId).emit('initiative-updated', data.state);
      logger.info(`[INITIATIVE] Updated state for room ${data.roomId}`);
    } catch (error) {
      logger.error(`[INITIATIVE] Error updating state for room ${data.roomId}:`, error);
    }
  });

  socket.on('initiative-add-combatant', async (data: { roomId: string; combatant: Combatant }) => {
    try {
      const { combatant } = data;
      if (!combatant.tokenId) return;

      const allowed = await isTokenOwnerOrGM(
        data.roomId,
        combatant.tokenId,
        socket.authenticatedUserId
      );
      if (!allowed) return;

      const state = await loadInitiativeState(data.roomId);
      if (state.combatants.some((c) => c.tokenId === combatant.tokenId)) return;

      const insertAt = state.combatants.findIndex((c) => c.initiative < combatant.initiative);
      const newList = [...state.combatants];
      if (insertAt === -1) newList.push(combatant);
      else newList.splice(insertAt, 0, combatant);

      const newState = { ...state, combatants: newList };
      await saveInitiativeState(data.roomId, newState);
      io.to(data.roomId).emit('initiative-updated', newState);
      logger.info(`[INITIATIVE] Added combatant ${combatant.tokenId} to room ${data.roomId}`);
    } catch (error) {
      logger.error(`[INITIATIVE] Error adding combatant in room ${data.roomId}:`, error);
    }
  });

  socket.on(
    'initiative-update-combatant',
    async (data: { roomId: string; tokenId: string; initiative: number }) => {
      try {
        const allowed = await isTokenOwnerOrGM(
          data.roomId,
          data.tokenId,
          socket.authenticatedUserId
        );
        if (!allowed) return;

        const state = await loadInitiativeState(data.roomId);
        const idx = state.combatants.findIndex((c) => c.tokenId === data.tokenId);
        if (idx === -1) return;

        const newCombatants = state.combatants.map((c) =>
          c.tokenId === data.tokenId ? { ...c, initiative: data.initiative } : c
        );
        const newState = { ...state, combatants: newCombatants };
        await saveInitiativeState(data.roomId, newState);
        io.to(data.roomId).emit('initiative-updated', newState);
        logger.info(
          `[INITIATIVE] Updated initiative for combatant ${data.tokenId} in room ${data.roomId}`
        );
      } catch (error) {
        logger.error(
          `[INITIATIVE] Error updating combatant initiative in room ${data.roomId}:`,
          error
        );
      }
    }
  );
}
