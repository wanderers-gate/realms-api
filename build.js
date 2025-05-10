const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Get the current SHA
  const sha = execSync('git rev-parse HEAD').toString().trim();

  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  esbuild.buildSync({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: 'dist/server.js',
    format: 'cjs',
    sourcemap: true,
    external: ['mongoose', 'express', 'dotenv'],
  });
  console.log('Build completed successfully!');

  // Create a copy with SHA for versioning
  const versionedFile = `dist/server.${sha}.js`;
  fs.copyFileSync('dist/server.js', versionedFile);
  fs.copyFileSync('dist/server.js.map', `dist/server.${sha}.js.map`);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
} 