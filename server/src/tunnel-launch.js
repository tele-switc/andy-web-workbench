// Tunnel launcher: starts cloudflared, captures the public URL, writes it to a file
// This lets the app and the user always know the current public address.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOGS = path.join(ROOT, 'logs');
if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS, { recursive: true });
const URL_FILE = path.join(LOGS, 'current-tunnel-url.txt');
const TUNNEL_LOG = path.join(LOGS, 'tunnel.log');

// Find cloudflared
const CANDIDATES = [
  process.env.CLOUDFLARED_PATH,
  'C:\\ProgramData\\cloudflared\\cloudflared.exe',
  'cloudflared',
];
const cloudflared = CANDIDATES.find(c => {
  if (!c) return false;
  if (c.includes('\\') || c.includes('/')) return fs.existsSync(c);
  return true;
});

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(TUNNEL_LOG, line);
  console.log(msg);
}

function start() {
  if (!cloudflared) {
    log('cloudflared not found. Install it to enable remote access.');
    process.exit(1);
  }
  log('Starting cloudflared tunnel...');
  const proc = spawn(cloudflared, ['tunnel', '--url', 'http://localhost:3000', '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let urlFound = false;
  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    log(text.trim());
    const m = text.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
    if (m && !urlFound) {
      urlFound = true;
      const url = m[0];
      fs.writeFileSync(URL_FILE, url + '\n');
      log(`PUBLIC URL CAPTURED: ${url}`);
    }
  });
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    const m = text.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
    if (m && !urlFound) {
      urlFound = true;
      const url = m[0];
      fs.writeFileSync(URL_FILE, url + '\n');
      log(`PUBLIC URL CAPTURED: ${url}`);
    }
  });

  proc.on('exit', (code) => {
    log(`cloudflared exited (code ${code}). Restarting in 5s...`);
    setTimeout(start, 5000);
  });
  proc.on('error', (err) => {
    log(`cloudflared error: ${err.message}. Restarting in 5s...`);
    setTimeout(start, 5000);
  });
}

start();