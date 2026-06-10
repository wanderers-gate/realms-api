import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';

jest.mock('../db', () => ({ db: {} }));

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';

let staticDir: string;
const originalNodeEnv = process.env.NODE_ENV;
const originalStaticDir = process.env.REALMS_STATIC_DIR;

const loadApp = (nodeEnv: string): Express => {
  process.env.NODE_ENV = nodeEnv;
  process.env.REALMS_STATIC_DIR = staticDir;
  let app: Express | undefined;
  jest.isolateModules(() => {
    app = require('../index').default;
  });
  if (!app) throw new Error('Failed to load app');
  return app;
};

beforeAll(() => {
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realms-static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), INDEX_HTML);
  fs.writeFileSync(path.join(staticDir, 'app.js'), 'console.log("app");');
});

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv ?? 'test';
  process.env.REALMS_STATIC_DIR = originalStaticDir ?? '';
  fs.rmSync(staticDir, { recursive: true, force: true });
});

describe('SPA fallback routing (production)', () => {
  let app: Express;

  beforeAll(() => {
    app = loadApp('production');
  });

  it('returns a JSON 404 for unknown /api routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.errors[0].status).toBe('404');
  });

  it('still returns a JSON 401 for protected /api routes without a token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('serves index.html at the root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe(INDEX_HTML);
  });

  it('serves static assets directly', async () => {
    const res = await request(app).get('/app.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('console.log');
  });

  it('returns index.html for unknown page routes', async () => {
    const res = await request(app).get('/rooms/some-room-slug');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toBe(INDEX_HTML);
  });
});

describe('SPA fallback routing (development)', () => {
  let app: Express;

  beforeAll(() => {
    app = loadApp('development');
  });

  it('does not serve static files or the SPA fallback', async () => {
    const root = await request(app).get('/');
    expect(root.status).toBe(404);

    const page = await request(app).get('/rooms/some-room-slug');
    expect(page.status).toBe(404);
  });

  it('still returns a JSON 404 for unknown /api routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
