import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config';

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');

const roomDir = (slug: string) => path.join(config.dataDir, 'rooms', slug);

export const createRoomDirs = (slug: string): void => {
  const assetsDir = path.join(roomDir(slug), 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(path.join(assetsDir, 'maps'), { recursive: true });
    fs.mkdirSync(path.join(assetsDir, 'tokens'), { recursive: true });
  }
};

export const renameRoomDir = (oldSlug: string, newSlug: string): void => {
  const oldDir = roomDir(oldSlug);
  const newDir = roomDir(newSlug);
  if (fs.existsSync(oldDir)) {
    fs.renameSync(oldDir, newDir);
  }
};
