import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use tsx to run server.ts
const { execSync } = require('child_process');
try {
  console.log('Starting server...');
  execSync('npx tsx server.ts', { stdio: 'inherit', cwd: __dirname, timeout: 60000 });
} catch (e) {
  console.error('Server failed to start', e);
  process.exit(1);
}