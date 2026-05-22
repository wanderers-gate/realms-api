import { type Document, Schema, model } from 'mongoose';

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
}

type TokenDocument = Document & Token;

const TokenSchema = new Schema<TokenDocument>(
  {
    id: { type: String, required: true, unique: true },
    roomId: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    color: { type: String, required: true },
    label: { type: String, default: '' },
    ownerId: { type: String, required: true },
    ownerIds: { type: [String], default: [] },
    imageUrl: { type: String },
  },
  { timestamps: true }
);

TokenSchema.index({ roomId: 1 });

export const TokenModel = model<TokenDocument>('Token', TokenSchema);
