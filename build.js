const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');

try {
  let sha = 'unknown';
  try {
    sha = execSync('git rev-parse HEAD').toString().trim();
  } catch {
    console.warn('Could not determine git sha; building without version info');
  }

  fs.rmSync('dist', { recursive: true, force: true });
  fs.mkdirSync('dist');

  esbuild.buildSync({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/server.js',
    format: 'cjs',
    sourcemap: true,
    // Native modules cannot be bundled
    external: ['better-sqlite3', 'argon2'],
    define: { 'process.env.BUILD_SHA': JSON.stringify(sha) },
  });

  console.log('Build completed successfully!');
  console.log(`Version: ${sha}`);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
