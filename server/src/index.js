import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

import * as db from './db/index.js';
import { setupWebSocket, broadcastChange, getConnectedCount } from './ws/index.js';
import { requireAuth, wsAuthToken } from './auth.js';import authRouter from './routes/auth.js';
import studentsRouter from './routes/students.js';
import leadsRouter from './routes/leads.js';
import recordsRouter from './routes/records.js';
import remindersRouter from './routes/reminders.js';
import aiRouter from './routes/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const PORT = Number(process.env.PORT || 3000);
const app = express();
const server = http.createServer(app);

// WebSocket server (real-time refresh across devices)
setupWebSocket(server);

// Read the stable public URL written by the Funnel setup script
function getPublicUrl() {
  try {
    const f = path.join(ROOT, 'logs', 'public-url.txt');
    if (fs.existsSync(f)) {
      const url = fs.readFileSync(f, 'utf8').trim();
      if (url) return url;
    }
  } catch {}
  return process.env.PUBLIC_URL || '';
}

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      time: new Date().toISOString(),
      connectedClients: getConnectedCount(),
      publicUrl: getPublicUrl(),
      students: db.getAllStudents().length,
      leads: db.getAllLeads().length,
      records: db.getAllRecords().length
    }
  });
});

// Public config (client uses this to auto-discover the stable API URL)
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      publicUrl: getPublicUrl(),
      name: 'Andy 工作台'
    }
  });
});

// Auth routes (public)
app.use('/api/auth', authRouter);

// Require auth for all other /api routes
app.use('/api', requireAuth);

// API Routes
app.use('/api/students', studentsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/records', recordsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/ai', aiRouter);

// Operation log
app.get('/api/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ success: true, data: db.getRecentLogs(limit) });
});

// Serve static frontend (production build)
const clientDist = path.join(ROOT, 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: '服务器内部错误', detail: err.message });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  let lan = '';
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name]) {
      if (ni.family === 'IPv4' && !ni.internal) { lan = ni.address; break; }
    }
    if (lan) break;
  }

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Andy英语学习规划师工作台 v2.0          ║');
  console.log('║   Kimi 风格 · AI 助手 · 本地数据          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  API 服务已启动:');
  console.log('  ┌──────────────────────────────────────');
  console.log(`  │ 本机访问    http://localhost:${PORT}`);
  if (lan) console.log(`  │ 手机(同WiFi) http://${lan}:${PORT}`);
  console.log('  │ 健康检查    http://localhost:' + PORT + '/api/health');
  console.log('  │ WebSocket   ws://localhost:' + PORT + '/ws');
  console.log('  └──────────────────────────────────────');
  console.log('');
  const pub = getPublicUrl();
  if (pub) {
    console.log('  固定公网地址 (Tailscale Funnel):');
    console.log(`    ${pub}`);
    console.log('');
  } else {
    console.log('  公网访问: 运行 scripts/tailscale-setup.ps1 启用 Funnel 后自动显示');
    console.log('');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  db.closeDb();
  server.close(() => {
    console.log('服务器已安全关闭');
    process.exit(0);
  });
});