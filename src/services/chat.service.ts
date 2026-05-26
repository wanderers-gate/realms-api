import { and, desc, eq, lt } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '../db';
import { chatMessages } from '../db/schema';
import type { DiceRollResult } from '../sockets/helpers/dice';

export type ChatMessage = InferSelectModel<typeof chatMessages>;

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
      .values({
        roomId,
        userId,
        username,
        message,
        diceRoll: diceRoll ?? null,
      })
      .returning();
    return msg;
  },

  async getMessagesBefore(roomId: string, beforeId: string, limit = 50): Promise<ChatMessage[]> {
    const ref = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.id, beforeId),
    });
    if (!ref?.timestamp) return [];

    const messages = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.roomId, roomId), lt(chatMessages.timestamp, ref.timestamp)))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);

    return messages.reverse();
  },

  async getRecentMessages(roomId: string, limit = 50): Promise<ChatMessage[]> {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);

    return messages.reverse();
  },
};
