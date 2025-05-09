const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Get the current SHA
  const sha = execSync('git rev-parse HEAD').toString().trim();

  esbuild.buildSync({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outdir: 'dist',
    format: 'esm',
    sourcemap: true,
    external: ['mongoose', 'express', 'dotenv'],
    outExtension: { '.js': `.${sha}.js` },
  });
  console.log('Build completed successfully!');

  // Rename source map file to include SHA
  const mapFile = 'dist/server.js.map';
  const newMapFile = `dist/server.${sha}.js.map`;
  if (fs.existsSync(mapFile)) {
    fs.renameSync(mapFile, newMapFile);
  }
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
} 