const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Get the current SHA
  const sha = execSync('git rev-parse HEAD').toString().trim();

  // Clean dist directory
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true });
  }
  fs.mkdirSync('dist');

  // Build with esbuild
  esbuild.buildSync({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: `dist/server.${sha}.js`,
    format: 'cjs',
    sourcemap: true,
    external: ['mongoose', 'express', 'dotenv'],
  });

  // Create a symlink for server.js
  fs.symlinkSync(`server.${sha}.js`, 'dist/server.js');
  fs.symlinkSync(`server.${sha}.js.map`, 'dist/server.js.map');

  console.log('Build completed successfully!');
  console.log(`Version: ${sha}`);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
} 