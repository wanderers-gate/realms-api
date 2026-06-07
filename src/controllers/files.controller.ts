import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import multer from 'multer';
import config from '../config/config';
import { db } from '../db';
import { handoutShares, rooms } from '../db/schema';
import { sendError } from '../helpers/response';
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

// Validates a path that ends in a filename (last segment may contain dots)
const isSafeFilePath = (p: unknown): p is string => {
  if (typeof p !== 'string' || !p) return false;
  const segments = p.split('/');
  if (segments.length < 1 || segments.length > 10) return false;
  const dirs = segments.slice(0, -1);
  const filename = segments[segments.length - 1];
  return (
    dirs.every(isSafeName) &&
    filename.length > 0 &&
    filename.length <= 120 &&
    /^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/.test(filename)
  );
};

const assetsDir = (slug: string) => path.join(config.dataDir, 'rooms', slug, 'assets');

const resolveDir = (slug: string, folderPath: string): string => {
  const base = path.join(config.dataDir, 'rooms', slug);
  if (!folderPath) return base;
  const resolved = path.join(base, ...folderPath.split('/'));
  if (!resolved.startsWith(base)) throw new Error('Path traversal detected');
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
      sendError(res, 404, 'Not Found', 'Room not found');
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
    sendError(res, 500, 'Internal Server Error', 'Failed to list folders');
  }
};

export const listFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { path: folderPath = '' } = req.query;

    if (!isSafePath(folderPath)) {
      sendError(res, 400, 'Bad Request', 'Invalid path');
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
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
          url: `rooms/${room.slug}/${folderPath ? `${folderPath}/` : ''}${e.name}`,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ data: { path: folderPath, directories, files } });
  } catch (error) {
    logger.error('Error listing files:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to list files');
  }
};

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { path: folderPath = '' } = req.body as { path?: unknown };

    if (!req.userId) {
      sendError(res, 401, 'Unauthorized', 'Authentication required');
      return;
    }

    if (!isSafePath(folderPath)) {
      sendError(res, 400, 'Bad Request', 'Invalid path');
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, 400, 'Bad Request', 'No file uploaded');
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

    const url = `rooms/${room.slug}/${folderPath ? `${folderPath}/` : ''}${filename}`;
    res.status(201).json({ data: { url, name: filename, path: folderPath } });
  } catch (error) {
    logger.error('Error uploading file:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to upload file');
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
      sendError(res, 401, 'Unauthorized', 'Authentication required');
      return;
    }

    if (!isSafePath(folderPath)) {
      sendError(res, 400, 'Bad Request', 'Invalid path');
      return;
    }

    if (
      typeof filename !== 'string' ||
      !filename ||
      filename.includes('/') ||
      filename.includes('..')
    ) {
      sendError(res, 400, 'Bad Request', 'Invalid filename');
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    if (room.createdById !== req.userId) {
      sendError(res, 403, 'Forbidden', 'Only the room creator can delete files');
      return;
    }

    const base = path.join(config.dataDir, 'rooms', room.slug);
    const dir = resolveDir(room.slug, folderPath as string);
    const filePath = path.join(dir, filename);

    if (!filePath.startsWith(base + path.sep)) {
      sendError(res, 400, 'Bad Request', 'Invalid file path');
      return;
    }

    if (!fs.existsSync(filePath)) {
      sendError(res, 404, 'Not Found', 'File not found');
      return;
    }

    fs.unlinkSync(filePath);

    // Clean up any share record for this file
    const imageUrl = `rooms/${room.slug}/${folderPath ? `${folderPath}/` : ''}${filename}`;
    await db
      .delete(handoutShares)
      .where(and(eq(handoutShares.roomId, room.id), eq(handoutShares.imageUrl, imageUrl)))
      .catch(() => {
        /* non-fatal */
      });

    res.status(200).json({ data: { deleted: true } });
  } catch (error) {
    logger.error('Error deleting file:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to delete file');
  }
};

export const createFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { path: folderPath } = req.body as { path?: unknown };

    if (!req.userId) {
      sendError(res, 401, 'Unauthorized', 'Authentication required');
      return;
    }
    if (!isSafePath(folderPath)) {
      sendError(res, 400, 'Bad Request', 'Invalid path');
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    const dir = resolveDir(room.slug, folderPath as string);
    fs.mkdirSync(dir, { recursive: true });
    res.status(201).json({ data: { path: folderPath } });
  } catch (error) {
    logger.error('Error creating folder:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to create folder');
  }
};

export const moveFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const { from, to } = req.body as { from?: unknown; to?: unknown };

    if (!req.userId) {
      sendError(res, 401, 'Unauthorized', 'Authentication required');
      return;
    }
    if (!isSafeFilePath(from) || !isSafeFilePath(to)) {
      sendError(res, 400, 'Bad Request', 'Invalid path');
      return;
    }

    const room = await resolveRoom(roomId);
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    const base = path.join(config.dataDir, 'rooms', room.slug);
    const fromPath = path.join(base, ...(from as string).split('/'));
    const toPath = path.join(base, ...(to as string).split('/'));

    if (!fromPath.startsWith(base + path.sep) || !toPath.startsWith(base + path.sep)) {
      sendError(res, 400, 'Bad Request', 'Invalid file path');
      return;
    }
    if (!fs.existsSync(fromPath)) {
      sendError(res, 404, 'Not Found', 'Source file not found');
      return;
    }

    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    fs.renameSync(fromPath, toPath);

    const newUrl = `rooms/${room.slug}/${to as string}`;
    res.json({ data: { url: newUrl } });
  } catch (error) {
    logger.error('Error moving file:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to move file');
  }
};

export const getHandoutShares = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const room = await resolveRoom(roomId);
    if (!room) {
      sendError(res, 404, 'Not Found', 'Room not found');
      return;
    }

    const rows = await db
      .select({ imageUrl: handoutShares.imageUrl })
      .from(handoutShares)
      .where(and(eq(handoutShares.roomId, room.id), eq(handoutShares.isShared, true)));

    const shared = new Set(rows.map((r) => r.imageUrl));
    res.json({ data: { shared: [...shared] } });
  } catch (error) {
    logger.error('Error fetching handout shares:', error);
    sendError(res, 500, 'Internal Server Error', 'Failed to fetch handout shares');
  }
};
