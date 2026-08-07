import { WebSocketServer } from 'ws';
import * as db from '../db/index.js';
import { wsAuthToken } from '../auth.js';

let wss = null;
const clients = new Set();

export function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Verify WebSocket auth via query parameter
    const payload = wsAuthToken(req.url);
    if (!payload) {
      ws.send(JSON.stringify({ type: 'error', message: '未授权，请先登录' }));
      ws.close(4001, 'Unauthorized');
      return;
    }
    ws.user = payload.sub;
    const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    ws.clientId = clientId;
    clients.add(ws);
    console.log(`[WS] Client connected: ${clientId} (${ws.user})`);

    // Send initial data sync
    ws.send(JSON.stringify({
      type: 'sync',
      data: {
        students: db.getAllStudents(),
        leads: db.getAllLeads(),
        records: db.getAllRecords()
      }
    }));

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());
        handleMessage(ws, msg);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected: ${clientId}`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error:`, err.message);
      clients.delete(ws);
    });
  });

  console.log('[WS] WebSocket server ready');
  return wss;
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'sync_request':
      ws.send(JSON.stringify({
        type: 'sync',
        data: {
          students: db.getAllStudents(),
          leads: db.getAllLeads(),
          records: db.getAllRecords()
        }
      }));
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
  }
}

// Broadcast data changes to all connected clients
export function broadcastChange(entity, action, data) {
  const message = JSON.stringify({
    type: 'change',
    entity,
    action,
    data,
    timestamp: Date.now()
  });
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

export function getConnectedCount() {
  return clients.size;
}