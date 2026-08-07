// IndexedDB 离线存储 — 数据缓存 + 离线操作队列
const DB_NAME = 'andy-workbench';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cache')) {
        const store = db.createObjectStore('cache', { keyPath: 'key' });
        store.createIndex('keys', 'key', { unique: true });
      }
      if (!db.objectStoreNames.contains('queue')) {
        const queue = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        queue.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result?.result ?? undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ---- Cache operations ----
export async function cacheSet(key, value) {
  return tx('cache', 'readwrite', store => store.put({ key, value, timestamp: Date.now() }));
}

export async function cacheGet(key) {
  const result = await tx('cache', 'readonly', store => store.get(key));
  return result?.value ?? null;
}

export async function cacheAll() {
  const result = await tx('cache', 'readonly', store => store.getAll());
  return result || [];
}

export async function cacheDelete(key) {
  return tx('cache', 'readwrite', store => store.delete(key));
}

export async function cacheClear() {
  return tx('cache', 'readwrite', store => store.clear());
}

// ---- Offline queue operations ----
export async function enqueueOperation(op) {
  const entry = {
    action: op.action,
    entity: op.entity,
    data: op.data,
    timestamp: Date.now()
  };
  return tx('queue', 'readwrite', store => store.add(entry));
}

export async function getQueuedOps() {
  const result = await tx('queue', 'readonly', store => store.getAll());
  return result?.sort((a, b) => a.timestamp - b.timestamp) || [];
}

export async function removeQueuedOp(id) {
  return tx('queue', 'readwrite', store => store.delete(id));
}

export async function clearQueue() {
  return tx('queue', 'readwrite', store => store.clear());
}

// ---- Meta ----
export async function setMeta(key, value) {
  return tx('meta', 'readwrite', store => store.put({ key, value }));
}

export async function getMeta(key) {
  const result = await tx('meta', 'readonly', store => store.get(key));
  return result?.value ?? null;
}

// ---- Sync helpers ----
export async function getLocalData() {
  const [students, leads, records] = await Promise.all([
    cacheGet('students'),
    cacheGet('leads'),
    cacheGet('records')
  ]);
  return {
    students: students || [],
    leads: leads || [],
    records: records || []
  };
}

export async function saveLocalData(data) {
  await Promise.all([
    cacheSet('students', data.students || []),
    cacheSet('leads', data.leads || []),
    cacheSet('records', data.records || [])
  ]);
}

export async function getLastSyncTime() {
  return getMeta('lastSyncTime');
}

export async function setLastSyncTime(time) {
  return setMeta('lastSyncTime', time);
}