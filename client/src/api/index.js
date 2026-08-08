// API 客户端 — 自动连接本地/远程服务器 + 离线队列 + 认证
import * as idb from '../db/indexeddb';

// API Base URL — 可配置（用于 GitHub Pages 连接远程服务器）
let API_BASE = '/api';
let CUSTOM_API_URL = localStorage.getItem('andy_api_base_url') || '';

export function getApiBase() {
  return CUSTOM_API_URL || API_BASE;
}

export function setApiBaseUrl(url) {
  CUSTOM_API_URL = url;
  localStorage.setItem('andy_api_base_url', url);
  if (!url) localStorage.removeItem('andy_api_base_url');
}

function resolvePath(path) {
  const base = CUSTOM_API_URL || '';
  if (base) return `${base}${path}`;
  return `${API_BASE}${path}`;
}

// Token management
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
let messageHandlers = [];
let isOnline = navigator.onLine !== false;



// ---- Toast (local) ----
let toastFn = null;
export function setToastHandler(fn) {
  toastFn = fn;
}
function toast(msg) {
  if (toastFn) toastFn(msg);
}

// Generic fetch session
let sessionFetch = null;

function makeIdempotencyKey() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---- Generic fetch helper with offline queue + auth ----
async function apiFetch(path, options = {}) {
  const url = resolvePath(path);
  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  // Add idempotency key for mutations (prevents duplicate writes on retry)
  if (method !== 'GET' && options.body) {
    try {
      const body = JSON.parse(options.body);
      if (!body.operation_id) body.operation_id = makeIdempotencyKey();
      headers['X-Idempotency-Key'] = body.operation_id;
      options = { ...options, body: JSON.stringify(body) };
    } catch {}
  }

  const config = { method, headers, ...options };

  // If offline and this is a mutation, queue it
  if (!isOnline && method !== 'GET') {
    const op = {
      operation_id: makeIdempotencyKey(),
      action: method.toLowerCase(),
      entity: path.split('/')[1], // students, leads, records
      data: { path, options: config },
      timestamp: Date.now()
    };
    await idb.enqueueOperation(op);
    console.log('[Offline] Queued operation:', op);
    return { queued: true, message: '操作已加入离线队列，联网后自动同步' };
  }

  try {
    const res = await fetch(url, config);
    // 401 — token invalid
    if (res.status === 401) {
      setToken('');
      throw new Error('登录已过期，请重新登录');
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '请求失败');
    }
    isOnline = true;
    return data.data;
  } catch (err) {
    // If it's a network error and this is a mutation, queue it
    if (method !== 'GET' && err.message !== '登录已过期，请重新登录') {
      const op = {
        operation_id: makeIdempotencyKey(),
        action: method.toLowerCase(),
        entity: path.split('/')[1],
        data: { path, options: config },
        timestamp: Date.now()
      };
      await idb.enqueueOperation(op);
      console.log('[Offline] Queued operation on error:', op);
      return { queued: true, message: '操作已加入离线队列，联网后自动同步' };
    }
    // For GET requests, try IndexedDB cache
    if (method === 'GET') {
      const cacheKey = path.replace(/^\//, '').replace(/[?/=]/g, '_');
      const cached = await idb.cacheGet(cacheKey);
      if (cached) return cached;
    }
    throw err;
  }
}

// Process queued operations when back online
export async function processOfflineQueue() {
  const ops = await idb.getQueuedOps();
  if (ops.length === 0) return;

  console.log(`[Offline] Processing ${ops.length} queued operations...`);
  for (const op of ops) {
    try {
      const { path, options } = op.data;
      // Ensure auth token is attached
      if (authToken && options.headers) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
      }
      const url = resolvePath(path);
      const res = await fetch(url, options);
      const data = await res.json();
      if (data.success) {
        await idb.removeQueuedOp(op.id);
        console.log(`[Offline] Processed: ${op.action} ${op.entity}`);
      } else if (res.status === 401) {
        // Auth error — can't process. Stop.
        console.warn('[Offline] Auth error, stopping queue processing');
        break;
      } else {
        // Server error — keep in queue, try again later
        console.warn(`[Offline] Server error: ${data.error}`);
      }
    } catch (err) {
      console.warn(`[Offline] Failed to process: ${op.action} ${op.entity}`, err.message);
      break; // Stop processing if still offline
    }
  }
  // Refresh data after processing
  const remaining = await idb.getQueuedOps();
  if (remaining.length === 0) {
    console.log('[Offline] All queued operations processed');
    // Refresh data from server
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

// Listen for online status
window.addEventListener('online', () => {
  isOnline = true;
  processOfflineQueue();
});
window.addEventListener('offline', () => {
  isOnline = false;
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

// ---- Health ----
export async function getHealth() {
  return apiFetch('/health');
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
  const baseHost = CUSTOM_API_URL ? new URL(CUSTOM_API_URL).host : window.location.host;
  const wsToken = authToken;
  const wsUrl = `${protocol}//${baseHost}/ws?token=${encodeURIComponent(wsToken)}`;

  function connect() {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] 已连接');
        if (handlers.onStatus) handlers.onStatus(true);
        ws.send(JSON.stringify({ type: 'sync_request' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Dispatch to all registered handlers
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
        if (handlers.onStatus) handlers.onStatus(false);
        ws = null;
        // Auto reconnect
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WS] 错误:', err);
        ws.close();
      };
    } catch (e) {
      console.error('[WS] 连接失败:', e);
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(connect, 5000);
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