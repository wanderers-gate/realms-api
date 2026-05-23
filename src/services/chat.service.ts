import { type ChatMessageDocument, ChatMessageModel } from '../models/chat-message-model';
import type { DiceRollResult } from '../sockets/helpers/dice';

export const chatService = {
  async saveMessage(
    roomId: string,
    userId: string,
    username: string,
    message: string,
    diceRoll?: DiceRollResult
  ): Promise<ChatMessageDocument> {
    const chatMessage = new ChatMessageModel({
      roomId,
      userId,
      username,
      message,
      timestamp: new Date(),
      ...(diceRoll && { diceRoll }),
    });

    return await chatMessage.save();
  },

  // Get recent messages for a room (last 50 messages)
  async getRecentMessages(roomId: string, limit = 50): Promise<ChatMessageDocument[]> {
    return await ChatMessageModel.find({ roomId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .sort({ timestamp: 1 }); // Sort back to chronological order
  },

  // Clean up old messages (keep only last 1000 messages per room)
  async cleanupOldMessages(roomId: string, keepCount = 1000): Promise<void> {
    const messages = await ChatMessageModel.find({ roomId })
      .sort({ timestamp: -1 })
      .limit(keepCount + 100); // Get a few extra to be safe

    if (messages.length > keepCount) {
      const messagesToDelete = messages.slice(keepCount);
      const messageIds = messagesToDelete.map((msg) => msg._id);

      await ChatMessageModel.deleteMany({ _id: { $in: messageIds } });
    }
  },
};
