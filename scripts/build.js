/**
 * Static production build script for etude-podologue.
 * Compiles TypeScript and prepares static dist/ folder.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

console.log('>>> 1. Compiling TypeScript to JavaScript...');
execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });

console.log('>>> 2. Copying static assets to dist/...');
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'src'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });

// Copy CSS
fs.copyFileSync(
  path.join(ROOT, 'src', 'style.css'),
  path.join(DIST, 'src', 'style.css')
);

// Copy Public Data
const publicData = path.join(ROOT, 'public', 'data');
if (fs.existsSync(publicData)) {
  for (const file of fs.readdirSync(publicData)) {
    fs.copyFileSync(
      path.join(publicData, file),
      path.join(DIST, 'data', file)
    );
  }
}

// Copy & Transform index.html (replace .ts with .js for native browser ESM)
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
html = html.replace('/src/main.ts', '/src/main.js');

// Also ensure relative imports inside dist/src/*.js have .js extensions if needed
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf-8');

console.log('>>> 3. Ensuring ES module specifiers in dist/src/...');
const distSrc = path.join(DIST, 'src');
for (const file of fs.readdirSync(distSrc)) {
  if (file.endsWith('.js')) {
    const filePath = path.join(distSrc, file);
    let code = fs.readFileSync(filePath, 'utf-8');
    // Replace relative imports without extension e.g. from './types' -> from './types.js'
    code = code.replace(/from\s+['"](\.\/[^'"]+)(?<!\.js)['"]/g, "from '$1.js'");
    fs.writeFileSync(filePath, code, 'utf-8');
  }
}

console.log('>>> BUILD SUCCESSFUL: Static site ready in dist/ directory.');
