import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { chatMessages, users } from '../db/schema';
import type { DiceRollResult } from '../sockets/helpers/dice';

export type ChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  diceRoll: unknown;
  timestamp: Date | null;
};

const messageSelect = {
  id: chatMessages.id,
  roomId: chatMessages.roomId,
  userId: chatMessages.userId,
  username: sql<string>`COALESCE(${users.displayName}, ${users.username}, ${chatMessages.username})`,
  message: chatMessages.message,
  diceRoll: chatMessages.diceRoll,
  timestamp: chatMessages.timestamp,
};

export const chatService = {
  async saveMessage(
    roomId: string,
    userId: string,
    username: string,
    message: string,
    diceRoll?: DiceRollResult
  ): Promise<ChatMessage> {
    const [msg] = await db
      .insert(chatMessages)
      .values({ roomId, userId, username, message, diceRoll: diceRoll ?? null })
      .returning();
    return msg;
  },

  async getMessagesBefore(roomId: string, beforeId: string, limit = 50): Promise<ChatMessage[]> {
    const ref = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.id, beforeId),
    });
    if (!ref?.timestamp) return [];

    const rows = await db
      .select(messageSelect)
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id))
      .where(and(eq(chatMessages.roomId, roomId), lt(chatMessages.timestamp, ref.timestamp)))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);

    return rows.reverse();
  },

  async getRecentMessages(roomId: string, limit = 50): Promise<ChatMessage[]> {
    const rows = await db
      .select(messageSelect)
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id))
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);

    return rows.reverse();
  },
};
