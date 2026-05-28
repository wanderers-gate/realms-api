import * as argon2 from 'argon2';
import { and, eq, or } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { roomPlayers, rooms, users } from '../db/schema';
import logger from '../utils/logger';

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
      .select({ id: users.id, username: users.username, hasPassword: users.password })
      .from(users)
      .where(eq(users.role, 'player'))
      .orderBy(users.username);

    res.json(rows.map((p) => ({ id: p.id, username: p.username, hasPassword: !!p.hasPassword })));
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
      .select({ id: users.id, username: users.username, hasPassword: users.password })
      .from(roomPlayers)
      .innerJoin(users, eq(roomPlayers.userId, users.id))
      .where(and(eq(roomPlayers.roomId, roomId), eq(users.role, 'player')))
      .orderBy(users.username);

    res.json(rows.map((p) => ({ id: p.id, username: p.username, hasPassword: !!p.hasPassword })));
  } catch (error) {
    logger.error('Error fetching room players:', error);
    res.status(500).json({ error: 'Failed to fetch room players' });
  }
};

export const createPlayer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

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
      .values({ username: username.trim(), password: hashedPassword, role: 'player' })
      .returning({ id: users.id, username: users.username, password: users.password });

    res
      .status(201)
      .json({ id: player.id, username: player.username, hasPassword: !!player.password });
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

    res.json({ id: player.id, username: player.username });
  } catch (error) {
    logger.error('Error verifying player password:', error);
    res.status(500).json({ error: 'Failed to verify password' });
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

    res.json({ id: player.id, username: player.username });
  } catch (error) {
    logger.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
};
