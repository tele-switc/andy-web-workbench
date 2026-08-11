import { Router } from 'express';
import * as db from '../db/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ai.js 在 server/src/ 下，.env 在 server/.env，手动读取以保证可靠性
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFromFile(envPath) {
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const vars = {};
    for (const line of raw.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 1) continue;
      const k = line.slice(0, i).trim();
      if (!k || k.startsWith('#')) continue;
      vars[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
    return vars;
  } catch { return {}; }
}

const envPath = path.resolve(__dirname, '..', '..', '.env');
const fileVars = loadEnvFromFile(envPath);

const AI_API_KEY = process.env.AI_API_KEY || fileVars.AI_API_KEY || '';
const AI_API_BASE = process.env.AI_API_BASE || fileVars.AI_API_BASE || 'https://api.agnes-ai.com/api/v1';
const AI_MODEL = process.env.AI_MODEL || fileVars.AI_MODEL || 'gpt-4o';

// Module-level AI API config (AI_API_KEY / AI_API_BASE / AI_MODEL loaded above)
const router = Router();

// Cache the last AI connectivity status (checked on demand)
let aiStatusCache = { checked: 0, status: 'unknown', detail: '' };

// Check whether the external AI is actually reachable & authenticated.
// Uses a cheap /models request. Results cached for 60s.
async function checkAiStatus(force = false) {
  const now = Date.now();
  if (!force && aiStatusCache.checked && now - aiStatusCache.checked < 60000) {
    return aiStatusCache;
  }
  if (!AI_API_KEY) {
    aiStatusCache = { checked: now, status: 'not_configured', detail: '未配置 AI_API_KEY' };
    return aiStatusCache;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${AI_API_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${AI_API_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      aiStatusCache = { checked: now, status: 'ok', detail: 'AI 服务可用' };
    } else if (res.status === 401) {
      aiStatusCache = { checked: now, status: 'invalid_key', detail: 'API Key 无效或已过期' };
    } else {
      aiStatusCache = { checked: now, status: 'error', detail: `HTTP ${res.status}` };
    }
  } catch (err) {
    aiStatusCache = { checked: now, status: 'unreachable', detail: err.name === 'AbortError' ? '连接超时' : err.message };
  }
  return aiStatusCache;
}

// Milestone definitions (shared with reminders)
const STUDENT_MILESTONES = [
  { key: 'd7', days: 7, title: '首次学习回访' },
  { key: 'd30', days: 30, title: '一个月学习反馈' },
  { key: 'd90', days: 90, title: '三个月成长回访' },
  { key: 'd180', days: 180, title: '半年阶段复盘' },
  { key: 'd365', days: 365, title: '年度成长反馈' },
  { key: 'd730', days: 730, title: '两年学习复盘' },
  { key: 'd1095', days: 1095, title: '三年成长总结' }
];

const LEAD_MILESTONES = [
  { key: 'f1', days: 1, title: '第一次跟进' },
  { key: 'f7', days: 7, title: '第二次跟进' },
  { key: 'f30', days: 30, title: '长期维护' },
  { key: 'f180', days: 180, title: '重新唤醒' }
];

// --- Local Rule Engine (no external API needed) ---

function generateLocalSuggestions() {
  const suggestions = [];
  const students = db.getAllStudents();
  const leads = db.getAllLeads();
  const records = db.getAllRecords();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Check for students with no recent records (30+ days)
  students.forEach(s => {
    const studentRecs = records.filter(r => r.studentId === s.id);
    const lastRec = studentRecs.sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!lastRec) {
      if (s.activateDate && s.activateDate <= today) {
        const daysSince = Math.round((new Date(today) - new Date(s.activateDate)) / 86400000);
        if (daysSince > 7) {
          suggestions.push({
            type: 'follow_up',
            title: `${s.name} 还没有回访记录`,
            content: `学员 ${s.name} 已激活 ${daysSince} 天，还没有任何回访记录。建议尽快安排首次回访，了解学习情况。`,
            relatedId: s.id
          });
        }
      }
    } else {
      const daysSince = Math.round((new Date(today) - new Date(lastRec.date)) / 86400000);
      if (daysSince > 30) {
        suggestions.push({
          type: 'follow_up',
          title: `${s.name} 已 ${daysSince} 天未回访`,
          content: `学员 ${s.name} 上次回访是 ${lastRec.date}，距今已 ${daysSince} 天。建议安排回访，了解近期学习进展。`,
          relatedId: s.id
        });
      }
    }
  });

  // 2. Check for leads stuck in early status
  leads.forEach(l => {
    if (l.consultDate && (l.followStatus === '新咨询' || l.followStatus === '已沟通')) {
      const daysSince = Math.round((new Date(today) - new Date(l.consultDate)) / 86400000);
      if (daysSince > 14) {
        suggestions.push({
          type: 'lead_reminder',
          title: `${l.wechatNickname} 待跟进`,
          content: `意向家长 ${l.wechatNickname} 咨询已 ${daysSince} 天，状态仍为"${l.followStatus}"。建议主动联系，了解考虑进展。`,
          relatedId: l.id
        });
      }
    }
  });

  // 3. Check for students approaching milestones
  students.forEach(s => {
    if (!s.activateDate) return;
    const done = s.remindersDone || [];
    STUDENT_MILESTONES.forEach(m => {
      if (done.includes(m.key)) return;
      const due = new Date(s.activateDate);
      due.setDate(due.getDate() + m.days);
      const dueStr = due.toISOString().slice(0, 10);
      const daysUntil = Math.round((due - new Date(today)) / 86400000);
      if (daysUntil >= 0 && daysUntil <= 3) {
        suggestions.push({
          type: 'milestone_coming',
          title: `${m.title} 即将到期`,
          content: `学员 ${s.name} 的「${m.title}」将在 ${daysUntil === 0 ? '今天' : daysUntil + ' 天后'}到期（${dueStr}）。请提前准备回访内容。`,
          relatedId: s.id
        });
      }
    });
  });

  // 4. Lead conversion suggestion
  leads.forEach(l => {
    if (l.followStatus === '考虑中' || l.followStatus === '待决定') {
      const daysSince = l.consultDate ? Math.round((new Date(today) - new Date(l.consultDate)) / 86400000) : 0;
      if (daysSince > 3 && daysSince < 60) {
        suggestions.push({
          type: 'convert_suggest',
          title: `${l.wechatNickname} 可考虑转化`,
          content: `家长 ${l.wechatNickname} 当前状态为"${l.followStatus}"，咨询已 ${daysSince} 天。如沟通顺畅，可尝试推动转化为正式学员。`,
          relatedId: l.id
        });
      }
    }
  });

  return suggestions;
}

// POST /api/ai/suggest — get AI-powered suggestions
router.post('/suggest', async (req, res) => {
  // Always generate local suggestions
  const localSuggestions = generateLocalSuggestions();

  // Save new suggestions to DB
  const saved = [];
  for (const s of localSuggestions) {
    const existing = db.getAiSuggestions(s.type, 'pending');
    const dup = existing.find(e => e.relatedId === s.relatedId && e.title === s.title);
    if (!dup) {
      saved.push(db.createAiSuggestion({ ...s, status: 'pending' }));
    }
  }

  // If AI API key is configured, try to get AI-powered insights
  let aiInsights = null;
  if (AI_API_KEY) {
    try {
      const students = db.getAllStudents();
      const leads = db.getAllLeads();
      const records = db.getAllRecords();

      const context = {
        studentCount: students.length,
        leadCount: leads.length,
        recordCount: records.length,
        recentRecords: records.slice(0, 5).map(r => ({
          student: r.studentName,
          date: r.date,
          feedback: r.parentFeedback?.slice(0, 50)
        })),
        pendingSuggestions: localSuggestions.slice(0, 5)
      };

      const response = await fetch(`${AI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个英语教育规划师的AI助手。根据当前工作台的数据，给出专业的教学规划建议、学员管理建议和跟进策略。保持简洁实用，每条建议不超过100字。以JSON数组格式返回，每条包含type和content字段。'
            },
            {
              role: 'user',
              content: `当前工作台数据：${JSON.stringify(context)}。请给出3-5条专业建议。`
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      const result = await response.json();
      if (result.choices && result.choices[0]) {
        try {
          aiInsights = JSON.parse(result.choices[0].message.content);
        } catch {
          aiInsights = [{ type: 'ai_insight', content: result.choices[0].message.content }];
        }
      }
    } catch (err) {
      console.error('AI API error:', err.message);
      // Fall back to local suggestions only
    }
  }

  const all = db.getAiSuggestions(null, 'pending');
  res.json({
    success: true,
    data: {
      suggestions: all,
      aiInsights,
      localCount: localSuggestions.length
    }
  });
});

// POST /api/ai/chat — chat with AI assistant
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, error: '请输入消息' });

  // Gather context
  const students = db.getAllStudents();
  const leads = db.getAllLeads();
  const records = db.getAllRecords();
  const recentLogs = db.getRecentLogs(20);

  const context = {
    studentCount: students.length,
    leadCount: leads.length,
    recordCount: records.length,
    students: students.map(s => ({
      name: s.name, grade: s.grade, level: s.englishLevel,
      activateDate: s.activateDate, remindersLeft: (s.remindersDone || []).length
    })),
    leads: leads.map(l => ({
      nickname: l.wechatNickname, status: l.followStatus,
      consultDate: l.consultDate, source: l.source
    })),
    recentActivity: recentLogs.map(l => ({
      action: l.type, entity: l.entity, time: new Date(l.timestamp).toISOString()
    }))
  };

  if (!AI_API_KEY) {
    // Local fallback response
    const localResponses = [
      `当前共有 ${students.length} 位正式学员和 ${leads.length} 位意向学员。${records.length} 条回访记录。`,
      `建议您今天关注 ${students.filter(s => {
        if (!s.activateDate) return false;
        const done = s.remindersDone || [];
        return STUDENT_MILESTONES.some(m => {
          if (done.includes(m.key)) return false;
          const due = new Date(s.activateDate);
          due.setDate(due.getDate() + m.days);
          return due <= new Date();
        });
      }).length} 位学员的到期回访。`,
      `最近操作日志共 ${recentLogs.length} 条，系统运行正常。`
    ];
    return res.json({
      success: true,
      data: { reply: localResponses.join('\n\n'), local: true }
    });
  }

  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(`${AI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是Andy英语学习规划师的AI助手，名叫小K。你专业、温和、实用。帮助Andy管理学员、跟进意向、规划教学。根据工作台数据给出具体建议。回答简洁、有温度，控制在200字以内。'
          },
          {
            role: 'user',
            content: `工作台数据：${JSON.stringify(context)}\n\nAndy的问题：${message}`
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    // Non-2xx: surface the AI provider error
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let detail = `AI 服务返回错误 (HTTP ${response.status})`;
      if (response.status === 401) {
        detail = 'AI API Key 无效或已过期，请在 agnes-ai.com 重新生成';
      } else if (errText) {
        try {
          const e = JSON.parse(errText);
          if (e.message) detail = e.message;
          if (e.error?.message) detail = e.error.message;
        } catch {}
      }
      aiStatusCache = { checked: Date.now(), status: response.status === 401 ? 'invalid_key' : 'error', detail };
      console.error(`AI chat HTTP ${response.status}: ${errText.slice(0, 200)}`);
      return res.json({
        success: true,
        data: {
          reply: detail + '。已切换本地模式，您的数据是安全的。当前共 ' + students.length + ' 位学员，' + leads.length + ' 位意向。',
          local: true,
          error: detail
        }
      });
    }

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content || '抱歉，我现在无法回答，请稍后再试。';
    res.json({ success: true, data: { reply, local: false } });
  } catch (err) {
    clearTimeout(timer);
    const detail = err.name === 'AbortError' ? 'AI 服务响应超时' : err.message;
    aiStatusCache = { checked: Date.now(), status: 'unreachable', detail };
    console.error('AI chat error:', detail);
    res.json({
      success: true,
      data: {
        reply: detail + '。已切换本地模式，您的数据是安全的。当前共 ' + students.length + ' 位学员，' + leads.length + ' 位意向。',
        local: true,
        error: detail
      }
    });
  }
});

// GET /api/ai/suggestions — get saved suggestions
router.get('/suggestions', (req, res) => {
  const { type, status } = req.query;
  const list = db.getAiSuggestions(type || null, status || null);
  res.json({ success: true, data: list });
});

// PUT /api/ai/suggestions/:id — update suggestion status
router.put('/suggestions/:id', (req, res) => {
  const { status } = req.body;
  const s = db.updateAiSuggestion(parseInt(req.params.id), { status });
  res.json({ success: true, data: s });
});

// GET /api/ai/analytics — data analytics
router.get('/analytics', (req, res) => {
  const students = db.getAllStudents();
  const leads = db.getAllLeads();
  const records = db.getAllRecords();
  const today = new Date().toISOString().slice(0, 10);

  // Status distribution
  const statusDist = {};
  leads.forEach(l => { statusDist[l.followStatus] = (statusDist[l.followStatus] || 0) + 1; });

  // Source distribution
  const sourceDist = {};
  leads.forEach(l => {
    const src = l.source || '未知';
    sourceDist[src] = (sourceDist[src] || 0) + 1;
  });

  // Monthly new students
  const monthlyStudents = {};
  students.forEach(s => {
    if (s.activateDate) {
      const month = s.activateDate.slice(0, 7);
      monthlyStudents[month] = (monthlyStudents[month] || 0) + 1;
    }
  });

  // Record frequency per student
  const recordFreq = {};
  students.forEach(s => {
    const count = records.filter(r => r.studentId === s.id).length;
    recordFreq[s.name] = count;
  });

  res.json({
    success: true,
    data: {
      totalStudents: students.length,
      totalLeads: leads.length,
      totalRecords: records.length,
      conversionRate: students.length > 0
        ? Math.round((students.length / (students.length + leads.length)) * 100)
        : 0,
      statusDistribution: statusDist,
      sourceDistribution: sourceDist,
      monthlyNewStudents: monthlyStudents,
      recordFrequency: recordFreq
    }
  });
});

// GET /api/ai/status — AI connectivity status (for the frontend indicator)
router.get('/status', async (req, res) => {
  const force = req.query.force === '1';
  const status = await checkAiStatus(force);
  res.json({
    success: true,
    data: {
      configured: !!AI_API_KEY,
      model: AI_MODEL,
      base: AI_API_BASE.replace(/^https?:\/\//, ''),
      ...status,
    }
  });
});

export default router;