import mongoose, { type Document, type Types } from 'mongoose';

export interface ChatMessage {
  _id: Types.ObjectId;
  roomId: string; // Reference to the room
  userId: string; // Socket ID or user ID
  username: string;
  message: string;
  timestamp: Date;
}

export type ChatMessageDocument = Document & ChatMessage;

const chatMessageSchema = new mongoose.Schema<ChatMessageDocument>(
  {
    roomId: {
      type: String,
      required: true,
      index: true, // For efficient queries by room
    },
    userId: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000, // Reasonable message length limit
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries by room and timestamp
chatMessageSchema.index({ roomId: 1, timestamp: -1 });

export const ChatMessageModel = mongoose.model<ChatMessageDocument>('ChatMessage', chatMessageSchema);
