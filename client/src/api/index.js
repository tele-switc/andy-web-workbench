// API 客户端 — 自动连接本地/远程服务器 + 离线队列 + 认证 + 主机在线状态
import * as idb from '../db/indexeddb';

// 固定公网 API 地址（Tailscale Funnel，重启不变）。GitHub Pages 前端用它连接家里电脑。
// 注意：路径拼接是 `${base}${path}`，因此 base 需要包含 /api 前缀。
const REMOTE_API_BASE = 'https://tech-taylor.taila3ecd9.ts.net/api';

// API Base URL — 可配置（localStorage 覆盖 > 按部署位置自动判断）
let API_BASE = detectDefaultBase();
let CUSTOM_API_URL = localStorage.getItem('andy_api_base_url') || '';

// 自动判断 API 地址：静态托管（GitHub Pages 等）-> 固定公网地址；Node 后端同源 -> /api
function detectDefaultBase() {
  if (typeof window === 'undefined') return '/api';
  const h = window.location.hostname;
  if (
    h.endsWith('.github.io') || h.endsWith('.pages.dev') ||
    h.endsWith('.vercel.app') || h.endsWith('.netlify.app')
  ) {
    return REMOTE_API_BASE;
  }
  return '/api';
}

export function getApiBase() {
  return CUSTOM_API_URL || API_BASE;
}

export function setApiBaseUrl(url) {
  CUSTOM_API_URL = url;
  localStorage.setItem('andy_api_base_url', url);
  if (!url) localStorage.removeItem('andy_api_base_url');
}

function resolvePath(path) {
  const base = CUSTOM_API_URL || API_BASE;
  if (base && base.startsWith('http')) return `${base}${path}`;
  return `${base}${path}`;
}

// ---- 主机在线状态（区分“手机断网”与“电脑关机”） ----
let hostOnline = true;
const hostListeners = [];

export function onHostStatus(cb) {
  hostListeners.push(cb);
  return () => {
    const i = hostListeners.indexOf(cb);
    if (i >= 0) hostListeners.splice(i, 1);
  };
}
export function getHostOnline() { return hostOnline; }

function setHostOnline(v) {
  if (hostOnline !== v) {
    hostOnline = v;
    for (const cb of hostListeners) { try { cb(v); } catch {} }
  }
}

// 探测后端是否可达（6 秒超时）
export async function checkHostHealth() {
  const url = resolvePath('/health');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    const ok = res.ok;
    setHostOnline(ok);
    return ok;
  } catch {
    clearTimeout(t);
    setHostOnline(false);
    return false;
  }
}

// ---- Token 管理 ----
let authToken = localStorage.getItem('andy_auth_token') || '';
let authCallbacks = [];

export function onAuthChange(cb) {
  authCallbacks.push(cb);
  return () => { authCallbacks = authCallbacks.filter(c => c !== cb); };
}

export function getToken() { return authToken; }
export function isLoggedIn() { return !!authToken; }

async function notifyAuth(state) {
  for (const cb of authCallbacks) { try { cb(state); } catch {} }
}

export function setToken(token) {
  authToken = token || '';
  if (token) localStorage.setItem('andy_auth_token', token);
  else localStorage.removeItem('andy_auth_token');
  notifyAuth(!!token);
}

export async function login(username, password) {
  const url = resolvePath('/auth/login');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '登录失败');
  setToken(data.data.token);
  return data.data;
}

let ws = null;
let wsReconnectTimer = null;
let wsRetry = 0;
let messageHandlers = [];
let isOnline = navigator.onLine !== false;

// ---- Toast (local) ----
let toastFn = null;
export function setToastHandler(fn) {
  toastFn = fn;
}
function toast(msg, type) {
  if (toastFn) toastFn(msg, type);
}

// ---- 通用 fetch：离线入队 + 认证 + 主机状态 ----
function makeIdempotencyKey() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function apiFetch(path, options = {}) {
  const url = resolvePath(path);
  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  if (method !== 'GET' && options.body) {
    try {
      const body = JSON.parse(options.body);
      if (!body.operation_id) body.operation_id = makeIdempotencyKey();
      headers['X-Idempotency-Key'] = body.operation_id;
      options = { ...options, body: JSON.stringify(body) };
    } catch {}
  }

  const config = { method, headers, ...options };

  const queueOp = async (over) => {
    const op = {
      operation_id: over.operation_id || makeIdempotencyKey(),
      action: method.toLowerCase(),
      entity: path.split('/')[1],
      data: { path, options: config },
      timestamp: Date.now()
    };
    await idb.enqueueOperation(op);
    console.log('[Offline] Queued operation:', op);
    return { queued: true, message: '已暂存到本机，联网后自动同步' };
  };

  // 手机断网：直接入队
  if (!isOnline && method !== 'GET') {
    return queueOp({});
  }

  try {
    const res = await fetch(url, config);
    if (res.status === 401) {
      setToken('');
      throw new Error('登录已过期，请重新登录');
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '请求失败');
    setHostOnline(true);
    isOnline = true;
    return data.data;
  } catch (err) {
    if (err.message === '登录已过期，请重新登录') throw err;
    // 请求失败 = 主机可能离线
    setHostOnline(false);
    if (method !== 'GET') {
      return queueOp({});
    }
    // GET：尝试本地缓存
    const cacheKey = path.replace(/^\//, '').replace(/[?/=]/g, '_');
    const cached = await idb.cacheGet(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

// ---- 联网恢复时处理离线队列 ----
export async function processOfflineQueue() {
  const ops = await idb.getQueuedOps();
  if (ops.length === 0) return;

  console.log(`[Offline] Processing ${ops.length} queued operations...`);
  let anySuccess = false;
  for (const op of ops) {
    try {
      const { path, options } = op.data;
      if (authToken && options.headers) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
      }
      const url = resolvePath(path);
      const res = await fetch(url, options);
      const data = await res.json();
      if (data.success) {
        await idb.removeQueuedOp(op.id);
        anySuccess = true;
        console.log(`[Offline] Processed: ${op.action} ${op.entity}`);
      } else if (res.status === 401) {
        console.warn('[Offline] Auth error, stopping queue processing');
        break;
      } else {
        console.warn(`[Offline] Server error: ${data.error}`);
      }
    } catch (err) {
      console.warn(`[Offline] Failed to process: ${op.action} ${op.entity}`, err.message);
      break;
    }
  }
  const remaining = await idb.getQueuedOps();
  if (remaining.length === 0 && anySuccess) {
    console.log('[Offline] All queued operations processed');
    try {
      const [students, leads, records] = await Promise.all([
        apiFetch('/students'),
        apiFetch('/leads'),
        apiFetch('/records'),
      ]);
      await idb.saveLocalData({ students, leads, records });
    } catch {}
  }
}

window.addEventListener('online', () => {
  isOnline = true;
  checkHostHealth().then(ok => { if (ok) processOfflineQueue(); });
});
window.addEventListener('offline', () => {
  isOnline = false;
  setHostOnline(false);
});

// ---- Students ----
export async function getStudents() {
  return apiFetch('/students');
}
export async function getStudent(id) {
  return apiFetch(`/students/${id}`);
}
export async function createStudent(data) {
  return apiFetch('/students', { method: 'POST', body: JSON.stringify(data) });
}
export async function updateStudent(id, data) {
  return apiFetch(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export async function deleteStudent(id) {
  return apiFetch(`/students/${id}`, { method: 'DELETE' });
}

// ---- Leads ----
export async function getLeads() {
  return apiFetch('/leads');
}
export async function getLead(id) {
  return apiFetch(`/leads/${id}`);
}
export async function createLead(data) {
  return apiFetch('/leads', { method: 'POST', body: JSON.stringify(data) });
}
export async function updateLead(id, data) {
  return apiFetch(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export async function deleteLead(id) {
  return apiFetch(`/leads/${id}`, { method: 'DELETE' });
}
export async function convertLead(id) {
  return apiFetch(`/leads/${id}/convert`, { method: 'POST' });
}

// ---- Records ----
export async function getRecords(studentId) {
  const q = studentId ? `?studentId=${studentId}` : '';
  return apiFetch(`/records${q}`);
}
export async function createRecord(data) {
  return apiFetch('/records', { method: 'POST', body: JSON.stringify(data) });
}
export async function updateRecord(id, data) {
  return apiFetch(`/records/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export async function deleteRecord(id) {
  return apiFetch(`/records/${id}`, { method: 'DELETE' });
}

// ---- Reminders ----
export async function getReminders() {
  return apiFetch('/reminders');
}
export async function getReminderStats() {
  return apiFetch('/reminders/stats');
}
export async function markReminderDone(ownerId, key, isStudent) {
  return apiFetch('/reminders/done', {
    method: 'POST',
    body: JSON.stringify({ ownerId, key, isStudent })
  });
}

// ---- AI ----
export async function getAiSuggestions() {
  return apiFetch('/ai/suggest');
}
export async function getSavedSuggestions(type, status) {
  const q = [];
  if (type) q.push(`type=${type}`);
  if (status) q.push(`status=${status}`);
  return apiFetch(`/ai/suggestions${q.length ? '?' + q.join('&') : ''}`);
}
export async function updateSuggestion(id, status) {
  return apiFetch(`/ai/suggestions/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
}
export async function aiChat(message) {
  return apiFetch('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
}
export async function getAnalytics() {
  return apiFetch('/ai/analytics');
}
export async function getAiStatus() {
  return apiFetch('/ai/status');
}

// ---- Health / Config ----
export async function getHealth() {
  return apiFetch('/health');
}
export async function getConfig() {
  try {
    const res = await fetch(resolvePath('/config'), { cache: 'no-store' });
    const data = await res.json();
    return data.data || {};
  } catch {
    return {};
  }
}

// ---- Logs ----
export async function getLogs(limit = 50) {
  return apiFetch(`/logs?limit=${limit}`);
}

// ---- WebSocket ----
export function connectWebSocket(handlers = {}) {
  messageHandlers.push(handlers);
  if (ws) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const baseHost = (CUSTOM_API_URL || API_BASE).startsWith('http')
    ? new URL(CUSTOM_API_URL || API_BASE).host
    : window.location.host;

  function connect() {
    try {
      const wsToken = getToken(); // 每次重连都用最新 token（登录后自动生效）
      const wsUrl = `${protocol}//${baseHost}/ws?token=${encodeURIComponent(wsToken)}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] 已连接');
        wsRetry = 0;
        setHostOnline(true);
        if (handlers.onStatus) handlers.onStatus(true);
        ws.send(JSON.stringify({ type: 'sync_request' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          messageHandlers.forEach(h => {
            if (msg.type === 'sync' && h.onSync) h.onSync(msg.data);
            if (msg.type === 'change' && h.onChange) h.onChange(msg);
            if (msg.type === 'pong' && h.onPong) h.onPong();
          });
        } catch (e) {
          console.error('[WS] 消息解析失败:', e);
        }
      };

      ws.onclose = () => {
        console.log('[WS] 连接断开');
        // WS 断开不视为主机离线（HTTP 健康检查才决定主机状态），避免 WS 偶发失败误报
        if (handlers.onStatus) handlers.onStatus(false);
        ws = null;
        clearTimeout(wsReconnectTimer);
        // 指数退避重连：4s → 8s → 16s → 30s，对 Funnel 更友好
        const delay = Math.min(4000 * Math.pow(2, wsRetry), 30000);
        wsRetry = Math.min(wsRetry + 1, 5);
        wsReconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.error('[WS] 错误:', err);
        ws.close();
      };
    } catch (e) {
      console.error('[WS] 连接失败:', e);
      clearTimeout(wsReconnectTimer);
      const delay = Math.min(4000 * Math.pow(2, wsRetry), 30000);
      wsRetry = Math.min(wsRetry + 1, 5);
      wsReconnectTimer = setTimeout(connect, delay);
    }
  }

  connect();

  return () => {
    messageHandlers = messageHandlers.filter(h => h !== handlers);
    if (messageHandlers.length === 0 && ws) {
      ws.close();
      ws = null;
    }
  };
}

export function sendWsMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
