import { randomUUID } from 'node:crypto';
import { integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

const timestamps = () => ({
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const users = sqliteTable('users', {
  id: id(),
  username: text('username').notNull().unique(),
  password: text('password'),
  displayName: text('display_name'),
  color: text('color').notNull().default('#60a5fa'),
  role: text('role').notNull().default('gm'),
  tokenVersion: integer('token_version').notNull().default(0),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  ...timestamps(),
});

export const rooms = sqliteTable('rooms', {
  id: id(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  roomCode: text('room_code').notNull().unique(),
  createdById: text('created_by_id')
    .notNull()
    .references(() => users.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  maxPlayers: integer('max_players').default(10),
  currentPlayers: integer('current_players').notNull().default(0),
  lastActivity: integer('last_activity', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  // Settings (flattened from nested object)
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  allowGuests: integer('allow_guests', { mode: 'boolean' }).notNull().default(true),
  gridSize: integer('grid_size').default(50),
  gridVisible: integer('grid_visible', { mode: 'boolean' }).default(true),
  gridType: text('grid_type').default('square'),
  snapToGrid: integer('snap_to_grid', { mode: 'boolean' }).default(false),
  gridOpacity: real('grid_opacity').default(0.6),
  canvasWidth: integer('canvas_width').default(3000),
  canvasHeight: integer('canvas_height').default(2000),
  ...timestamps(),
});

export const userPermissions = sqliteTable(
  'user_permissions',
  {
    id: id(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    userId: text('user_id').notNull(),
    canModifyDrawings: integer('can_modify_drawings', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [unique('uq_permission_room_user').on(table.roomId, table.userId)]
);

export const chatMessages = sqliteTable('chat_messages', {
  id: id(),
  roomId: text('room_id')
    .notNull()
    .references(() => rooms.id),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  message: text('message').notNull(),
  diceRoll: text('dice_roll', { mode: 'json' }),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const canvases = sqliteTable('canvases', {
  id: id(),
  roomId: text('room_id')
    .notNull()
    .unique()
    .references(() => rooms.id),
  lastModified: integer('last_modified', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  version: integer('version').notNull().default(1),
  createdById: text('created_by_id')
    .notNull()
    .references(() => users.id),
  mapUrl: text('map_url'),
  ...timestamps(),
});

export const canvasOperations = sqliteTable('canvas_operations', {
  id: id(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvases.id),
  opId: text('op_id').notNull().unique(),
  type: text('type').notNull(),
  tool: text('tool').notNull(),
  points: text('points', { mode: 'json' }).notNull(),
  color: text('color').notNull(),
  size: real('size').notNull(),
  rotation: real('rotation'),
  userId: text('user_id').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

export const roomPlayers = sqliteTable(
  'room_players',
  {
    id: id(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    joinedAt: integer('joined_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [unique('uq_room_player').on(table.roomId, table.userId)]
);

export const initiativeTrackers = sqliteTable('initiative_trackers', {
  id: id(),
  roomId: text('room_id')
    .notNull()
    .unique()
    .references(() => rooms.id),
  state: text('state', { mode: 'json' })
    .notNull()
    .$defaultFn(() => ({})),
  ...timestamps(),
});

export const handoutShares = sqliteTable(
  'handout_shares',
  {
    id: id(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [unique('uq_handout_share').on(table.roomId, table.imageUrl)]
);

export const characterSheets = sqliteTable('character_sheets', {
  id: id(),
  roomId: text('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull(),
  tokenId: text('token_id'),
  systemId: text('system_id').notNull(),
  name: text('name').notNull(),
  isNpc: integer('is_npc', { mode: 'boolean' }).notNull().default(false),
  portraitUrl: text('portrait_url'),
  sheetData: text('sheet_data', { mode: 'json' })
    .notNull()
    .$defaultFn(() => ({})),
  ...timestamps(),
});

export const tokens = sqliteTable('tokens', {
  id: id(),
  tokenId: text('token_id').notNull().unique(),
  roomId: text('room_id')
    .notNull()
    .references(() => rooms.id),
  x: real('x').notNull(),
  y: real('y').notNull(),
  width: real('width').notNull(),
  height: real('height').notNull(),
  color: text('color').notNull(),
  label: text('label').notNull().default(''),
  ownerId: text('owner_id').notNull(),
  ownerIds: text('owner_ids', { mode: 'json' })
    .notNull()
    .$defaultFn(() => []),
  imageUrl: text('image_url'),
  imageOffsetX: real('image_offset_x').notNull().default(0),
  imageOffsetY: real('image_offset_y').notNull().default(0),
  imageScale: real('image_scale').notNull().default(1),
  visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
  hp: integer('hp').notNull().default(0),
  maxHp: integer('max_hp').notNull().default(0),
  conditions: text('conditions', { mode: 'json' })
    .notNull()
    .$defaultFn(() => []),
  initiative: integer('initiative').notNull().default(0),
  ...timestamps(),
});
