// Simple stateless token authentication (HMAC-signed)
// Uses a server secret from .env. No external deps, no sessions stored.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SECRET = process.env.AUTH_SECRET || (() => {
  const secretFile = path.join(__dirname, '..', 'data', '.auth-secret');
  try {
    if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.mkdirSync(path.dirname(secretFile), { recursive: true }); fs.writeFileSync(secretFile, s, 'utf8'); } catch {}
  return s;
})();

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function b64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

export function signToken(payload) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(b64urlDecode(body).toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueToken(username) {
  return signToken({ sub: username, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS });
}

export function checkCredentials(username, password) {
  const expectedUser = process.env.AUTH_USER || 'admin';
  const expectedPass = process.env.AUTH_PASSWORD || 'admin123';
  try {
    const u = crypto.timingSafeEqual(Buffer.from(String(username)), Buffer.from(String(expectedUser)));
    const p = crypto.timingSafeEqual(Buffer.from(String(password)), Buffer.from(String(expectedPass)));
    return u && p;
  } catch {
    return false;
  }
}

// Express middleware: require valid Bearer token
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ success: false, error: '未授权，请先登录' });
  }
  req.user = payload.sub;
  next();
}

// WebSocket auth helper
export function wsAuthToken(url) {
  try {
    const parsed = new URL(url, 'http://localhost');
    const token = parsed.searchParams.get('token');
    if (token) return verifyToken(token);
  } catch {}
  return null;
}