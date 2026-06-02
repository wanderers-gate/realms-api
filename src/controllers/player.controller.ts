import * as argon2 from 'argon2';
import { and, eq, or } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { roomPlayers, rooms, users } from '../db/schema';
import { generateToken } from '../utils/jwt';
import logger from '../utils/logger';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const resolveRoomId = async (roomIdOrCode: string): Promise<string | null> => {
  const room = await db.query.rooms.findFirst({
    where: or(eq(rooms.id, roomIdOrCode), eq(rooms.roomCode, roomIdOrCode.toUpperCase())),
    columns: { id: true },
  });
  return room?.id ?? null;
};

export const getPlayers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        hasPassword: users.password,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .where(eq(users.role, 'player'))
      .orderBy(users.username);

    res.json(
      rows.map((p) => ({
        id: p.id,
        username: p.username,
        hasPassword: !!p.hasPassword,
        lastSeenAt: p.lastSeenAt ?? null,
      }))
    );
  } catch (error) {
    logger.error('Error fetching players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
};

export const getRoomPlayers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId: roomIdOrCode } = req.params;
    const roomId = await resolveRoomId(roomIdOrCode);
    if (!roomId) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        hasPassword: users.password,
        lastSeenAt: users.lastSeenAt,
      })
      .from(roomPlayers)
      .innerJoin(users, eq(roomPlayers.userId, users.id))
      .where(and(eq(roomPlayers.roomId, roomId), eq(users.role, 'player')))
      .orderBy(users.username);

    res.json(
      rows.map((p) => ({
        id: p.id,
        username: p.username,
        hasPassword: !!p.hasPassword,
        lastSeenAt: p.lastSeenAt ?? null,
      }))
    );
  } catch (error) {
    logger.error('Error fetching room players:', error);
    res.status(500).json({ error: 'Failed to fetch room players' });
  }
};

export const createPlayer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, color } = req.body;

    if (!username?.trim()) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.username, username.trim()),
    });
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const hashedPassword = password ? await argon2.hash(password) : null;
    const [player] = await db
      .insert(users)
      .values({
        username: username.trim(),
        password: hashedPassword,
        color: color || '#60a5fa',
        role: 'player',
      })
      .returning({
        id: users.id,
        username: users.username,
        color: users.color,
        password: users.password,
        tokenVersion: users.tokenVersion,
      });

    const token = generateToken(player.id, player.tokenVersion);
    res.cookie('token', token, COOKIE_OPTIONS);

    res.status(201).json({
      id: player.id,
      username: player.username,
      color: player.color,
      hasPassword: !!player.password,
    });
  } catch (error) {
    logger.error('Error creating player:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
};

export const verifyPlayerPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId, password } = req.body;

    if (!playerId || !password) {
      res.status(400).json({ error: 'playerId and password are required' });
      return;
    }

    const player = await db.query.users.findFirst({
      where: and(eq(users.id, playerId), eq(users.role, 'player')),
    });

    if (!player || !player.password) {
      res.status(404).json({ error: 'Player not found or has no password' });
      return;
    }

    const valid = await argon2.verify(player.password, password);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    const token = generateToken(player.id, player.tokenVersion);
    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({ id: player.id, username: player.username });
  } catch (error) {
    logger.error('Error verifying player password:', error);
    res.status(500).json({ error: 'Failed to verify password' });
  }
};

export const renamePlayer = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'gm') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { playerId } = req.params;
    const { username } = req.body;
    if (!username?.trim()) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    const player = await db.query.users.findFirst({
      where: and(eq(users.id, playerId), eq(users.role, 'player')),
    });
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    const [updated] = await db
      .update(users)
      .set({ username: username.trim() })
      .where(eq(users.id, playerId))
      .returning({
        id: users.id,
        username: users.username,
        color: users.color,
        password: users.password,
      });
    res.json({
      id: updated.id,
      username: updated.username,
      color: updated.color,
      hasPassword: !!updated.password,
    });
  } catch (error) {
    logger.error('Error renaming player:', error);
    res.status(500).json({ error: 'Failed to rename player' });
  }
};

export const kickPlayer = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'gm') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { playerId } = req.params;
    const player = await db.query.users.findFirst({
      where: and(eq(users.id, playerId), eq(users.role, 'player')),
    });
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    await db.delete(users).where(eq(users.id, playerId));
    res.status(204).send();
  } catch (error) {
    logger.error('Error kicking player:', error);
    res.status(500).json({ error: 'Failed to kick player' });
  }
};

export const updateOwnProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const player = req.user;
    if (!player || player.role !== 'player') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { color, username } = req.body;
    const updates: Partial<typeof users.$inferInsert> = {};
    if (color) updates.color = color;
    if (username?.trim()) updates.username = username.trim();
    if (!Object.keys(updates).length) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }
    const [updated] = await db.update(users).set(updates).where(eq(users.id, player.id)).returning({
      id: users.id,
      username: users.username,
      color: users.color,
      password: users.password,
    });
    res.json({
      id: updated.id,
      username: updated.username,
      color: updated.color,
      hasPassword: !!updated.password,
    });
  } catch (error) {
    logger.error('Error updating own profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const changeOwnPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const player = req.user;
    if (!player || player.role !== 'player') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) {
      res.status(400).json({ error: 'New password is required' });
      return;
    }
    if (player.password) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required' });
        return;
      }
      const valid = await argon2.verify(player.password, currentPassword);
      if (!valid) {
        res.status(401).json({ error: 'Incorrect current password' });
        return;
      }
    }
    const hashed = await argon2.hash(newPassword);
    await db
      .update(users)
      .set({ password: hashed, tokenVersion: player.tokenVersion + 1 })
      .where(eq(users.id, player.id));
    res.status(204).send();
  } catch (error) {
    logger.error('Error changing own password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

export const resetPlayerPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId } = req.params;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: 'New password is required' });
      return;
    }

    const player = await db.query.users.findFirst({
      where: and(eq(users.id, playerId), eq(users.role, 'player')),
    });
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const hashedPassword = await argon2.hash(password);
    await db
      .update(users)
      .set({ password: hashedPassword, tokenVersion: player.tokenVersion + 1 })
      .where(eq(users.id, playerId));

    res.status(204).send();
  } catch (error) {
    logger.error('Error resetting player password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

export const joinRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId: roomIdOrCode, playerId } = req.params;

    const [roomId, player] = await Promise.all([
      resolveRoomId(roomIdOrCode),
      db.query.users.findFirst({ where: and(eq(users.id, playerId), eq(users.role, 'player')) }),
    ]);

    if (!roomId) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const existing = await db.query.roomPlayers.findFirst({
      where: and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, playerId)),
    });

    if (!existing) {
      await db.insert(roomPlayers).values({ roomId, userId: playerId });
    }

    const token = generateToken(player.id, player.tokenVersion);
    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({ id: player.id, username: player.username });
  } catch (error) {
    logger.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
};
