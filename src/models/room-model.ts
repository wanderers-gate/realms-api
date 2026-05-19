import mongoose, { type Document, type Model, type Types } from 'mongoose';

export interface UserPermission {
  userId: string;
  canModifyDrawings: boolean;
}

export interface Room {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  roomId: string; // Unique room identifier (6-character code)
  createdBy: Types.ObjectId; // Reference to User who created the room
  isActive: boolean; // Whether the room is currently active
  maxPlayers?: number; // Optional player limit
  currentPlayers: number; // Current number of players in the room
  settings: {
    isPrivate: boolean; // Whether the room requires an invite
    allowGuests: boolean; // Whether non-authenticated users can join
    gridSize?: number; // Grid size for the virtual tabletop
  };
  userPermissions: UserPermission[];
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date; // Track when the room was last used
}

export type RoomDocument = Document & Room;

const roomSchema = new mongoose.Schema<RoomDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    roomId: {
      type: String,
      required: false, // Will be set by pre-save hook
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 6,
      maxlength: 6,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    maxPlayers: {
      type: Number,
      required: false,
      min: 1,
      max: 50,
      default: 10,
    },
    currentPlayers: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    settings: {
      isPrivate: {
        type: Boolean,
        required: true,
        default: false,
      },
      allowGuests: {
        type: Boolean,
        required: true,
        default: true,
      },
      gridSize: {
        type: Number,
        required: false,
        min: 10,
        max: 100,
        default: 50,
      },
    },
    lastActivity: {
      type: Date,
      required: true,
      default: Date.now,
    },
    userPermissions: {
      type: [
        {
          userId: { type: String, required: true },
          canModifyDrawings: { type: Boolean, required: true, default: false },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique room ID before saving
roomSchema.pre('save', async function (next) {
  if (!this.isNew) return next();

  // Generate a unique room ID
  let roomId: string;
  let isUnique = false;

  while (!isUnique) {
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const existingRoom = await mongoose.model('Room').findOne({ roomId });
    if (!existingRoom) {
      isUnique = true;
    }
  }

  // biome-ignore lint/style/noNonNullAssertion: roomId is guaranteed to be defined after the while loop
  this.roomId = roomId!;
  next();
});

// Update lastActivity when room is modified
roomSchema.pre('save', function (next) {
  this.lastActivity = new Date();
  next();
});

export const RoomModel = mongoose.model<RoomDocument>('Room', roomSchema);
