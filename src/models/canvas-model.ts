import { type Document, Schema, type Types, model } from 'mongoose';
import type { CanvasOperation } from '../types/canvas';

// Maximum number of operations to store per room
export const MAX_CANVAS_OPERATIONS = 1000;

interface CanvasDocument extends Document {
  roomId: string;
  operations: CanvasOperation[];
  lastModified: Date;
  version: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PointSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false }
);

const CanvasOperationSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['draw', 'erase', 'clear'],
    },
    tool: {
      type: String,
      required: true,
      enum: ['pen', 'eraser'],
    },
    points: [PointSchema],
    color: { type: String, required: true },
    size: { type: Number, required: true, min: 1, max: 100 },
    timestamp: { type: Date, required: true },
    userId: { type: String, required: true },
  },
  { _id: false }
);

const CanvasSchema = new Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    operations: [CanvasOperationSchema],
    lastModified: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure we don't exceed the maximum number of operations
CanvasSchema.pre('save', function () {
  if (this.operations.length > MAX_CANVAS_OPERATIONS) {
    // Remove oldest operations to stay within limit
    const excessCount = this.operations.length - MAX_CANVAS_OPERATIONS;
    this.operations.splice(0, excessCount);
  }

  this.lastModified = new Date();

  // Only increment version if this is not a new document
  if (!this.isNew) {
    this.version += 1;
  }
});

// Index for efficient room lookups
CanvasSchema.index({ roomId: 1 });
CanvasSchema.index({ lastModified: -1 });

export const CanvasModel = model<CanvasDocument>('Canvas', CanvasSchema);
export type { CanvasDocument };
