import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import multer from 'multer';
import config from '../config/config';
import { db } from '../db';
import { rooms } from '../db/schema';
import logger from '../utils/logger';

export const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Prevents path traversal while allowing flexible folder/file names
const isSafeName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 60 &&
  /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(name);

// Validates a slash-separated relative path (each segment must pass isSafeName)
const isSafePath = (p: unknown): p is string => {
  if (typeof p !== 'string') return false;
  if (p === '') return true;
  const segments = p.split('/');
  return segments.length <= 10 && segments.every(isSafeName);
};

const assetsDir = (slug: string) => path.join(config.dataDir, 'rooms', slug, 'assets');

const resolveDir = (slug: string, folderPath: string): string => {
  const base = assetsDir(slug);
  if (!folderPath) return base;
  const resolved = path.join(base, ...folderPath.split('/'));
  // Defense in depth: ensure we haven't escaped the data directory
  if (!resolved.startsWith(config.dataDir)) throw new Error('Path traversal detected');
  return resolved;
};

async function resolveRoom(roomId: string) {
  return db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
}

export const listFolders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    const room = await resolveRoom(roomId);
    if (!room) {
      res.status(404).json({
        errors: [{ status: '404', title: 'Not Found', detail: 'Room not found' }],
      });
      return;
    }

    const dir = assetsDir(room.slug);
    if (!fs.existsSync(dir)) {
      res.json({ data: { folders: [] } });
      return;
    }

    const folders = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    res.json({ data: { folders } });
  } catch (error) {
    logger.error('Error listing folders:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to list folders' }],
    });
  }
};

export const listFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { path: folderPath = '' } = req.query;

    if (!isSafePath(folderPath)) {
      res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid path' }],
      });
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      res.status(404).json({
        errors: [{ status: '404', title: 'Not Found', detail: 'Room not found' }],
      });
      return;
    }

    const dir = resolveDir(room.slug, folderPath as string);

    if (!fs.existsSync(dir)) {
      res.json({ data: { path: folderPath, directories: [], files: [] } });
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    const directories = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        path: folderPath ? `${folderPath}/${e.name}` : e.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const files = entries
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => {
        const stat = fs.statSync(path.join(dir, e.name));
        return {
          name: e.name,
          url: `rooms/${room.slug}/assets/${folderPath ? `${folderPath}/` : ''}${e.name}`,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ data: { path: folderPath, directories, files } });
  } catch (error) {
    logger.error('Error listing files:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to list files' }],
    });
  }
};

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { path: folderPath = '' } = req.body as { path?: unknown };

    if (!req.userId) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'Authentication required' }],
      });
      return;
    }

    if (!isSafePath(folderPath)) {
      res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid path' }],
      });
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      res.status(404).json({
        errors: [{ status: '404', title: 'Not Found', detail: 'Room not found' }],
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'No file uploaded' }],
      });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .substring(0, 40);
    const filename = `${baseName}-${Date.now()}${ext}`;

    const dir = resolveDir(room.slug, folderPath as string);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), file.buffer);

    const url = `rooms/${room.slug}/assets/${folderPath ? `${folderPath}/` : ''}${filename}`;
    res.status(201).json({ data: { url, name: filename, path: folderPath } });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to upload file' }],
    });
  }
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { path: folderPath = '', filename } = req.body as {
      path?: unknown;
      filename?: unknown;
    };

    if (!req.userId) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'Authentication required' }],
      });
      return;
    }

    if (!isSafePath(folderPath)) {
      res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid path' }],
      });
      return;
    }

    if (
      typeof filename !== 'string' ||
      !filename ||
      filename.includes('/') ||
      filename.includes('..')
    ) {
      res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid filename' }],
      });
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      res.status(404).json({
        errors: [{ status: '404', title: 'Not Found', detail: 'Room not found' }],
      });
      return;
    }

    if (room.createdById !== req.userId) {
      res.status(403).json({
        errors: [
          { status: '403', title: 'Forbidden', detail: 'Only the room creator can delete files' },
        ],
      });
      return;
    }

    const base = assetsDir(room.slug);
    const dir = resolveDir(room.slug, folderPath as string);
    const filePath = path.join(dir, filename);

    // Reject any path that escapes the assets directory
    if (!filePath.startsWith(base + path.sep)) {
      res.status(400).json({
        errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid file path' }],
      });
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        errors: [{ status: '404', title: 'Not Found', detail: 'File not found' }],
      });
      return;
    }

    fs.unlinkSync(filePath);
    res.status(200).json({ data: { deleted: true } });
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({
      errors: [{ status: '500', title: 'Internal Server Error', detail: 'Failed to delete file' }],
    });
  }
};
