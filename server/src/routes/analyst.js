import { Router } from 'express';
import * as db from '../db/index.js';

const router = Router();

const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_API_BASE = process.env.AI_API_BASE || 'https://apihub.agnes-ai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'agnes-2.5-flash';

// Guard against hammering the AI API: only synthesize every N new observations
let lastSynthesizedCount = 0;
let lastSynthesizedAt = 0;

// ---------- 观察记录 ----------
router.post('/observe', (req, res) => {
  const { studentId, category, detail } = req.body || {};
  if (!category) return res.status(400).json({ success: false, error: 'category 必填' });
  db.createObservation({
    studentId: studentId || '',
    category,
    source: `${req.method} ${req.originalUrl}`,
    detail: JSON.stringify(detail || {}),
  });
  res.json({ success: true });
});

// ---------- 综合状态 ----------
router.get('/status', (req, res) => {
  res.json({ success: true, data: db.getAnalystStatus() });
});

router.get('/observations', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const studentId = req.query.studentId || null;
  const rows = db.getObservations(limit, studentId);
  res.json({ success: true, data: rows.map(r => ({ ...r, detail: safeParse(r.detail) })) });
});

// ---------- "AI 学到了什么" 页面数据 ----------
router.get('/learned', (req, res) => {
  const observations = db.getObservations(60).map(r => ({ ...r, detail: safeParse(r.detail) }));
  const hypotheses = db.getHypotheses();
  const principles = db.getPrinciples();
  const questions = db.getQuestions('pending').slice(0, 20);
  const answers = db.getAnswers();
  const feedback = getFeedback();
  const decisions = db.getCaseDecisions().slice(0, 30);
  const outcomes = db.getCaseOutcomes().slice(0, 30);
  res.json({
    success: true,
    data: { observations, hypotheses, principles, questions, answers, feedback, decisions, outcomes, status: db.getAnalystStatus() },
  });
});

// ---------- 主动提问 ----------
router.get('/questions', (req, res) => {
  res.json({ success: true, data: db.getQuestions('pending') });
});

router.post('/answer', (req, res) => {
  const { questionId, answer, skip, dismiss } = req.body || {};
  if (!questionId) return res.status(400).json({ success: false, error: 'questionId 必填' });
  const q = db.getQuestions().find(x => x.id === questionId);
  if (!q) return res.status(404).json({ success: false, error: '问题不存在' });

  if (dismiss) {
    db.updateQuestion(questionId, { status: 'dismissed', answered_at: Date.now() });
    return res.json({ success: true });
  }
  if (skip || !answer) {
    db.updateQuestion(questionId, { status: 'skipped', answered_at: Date.now() });
    return res.json({ success: true });
  }

  // 记录回答
  const ans = db.createAnswer({ question_id: questionId, answer_text: answer, updated_principle: null });
  db.updateQuestion(questionId, { status: 'answered', answered_at: Date.now() });

  // 尝试把回答提炼为"已确认原则"
  let principleId = null;
  try {
    const p = extractPrincipleFromAnswer(q, answer);
    if (p) {
      const row = db.createPrinciple({ ...p, confirmed_by: ans.lastInsertRowid });
      principleId = row.lastInsertRowid;
      db.createAnswer({ question_id: questionId, answer_text: answer, updated_principle: principleId });
    }
  } catch {}

  res.json({ success: true, data: { principleId } });
});

// ---------- 纠正错误记忆 ----------
router.post('/correct', (req, res) => {
  const { targetType, targetId, correction } = req.body || {};
  if (!targetType || !targetId || !correction) return res.status(400).json({ success: false, error: '参数不足' });
  db.createFeedback({ target_type: targetType, target_id: targetId, correction });
  // 若纠正的是假设，将其标记为已推翻
  if (targetType === 'hypothesis') {
    db.updateHypothesis(targetId, { status: 'refuted' });
  }
  res.json({ success: true });
});

router.delete('/feedback/:id', (req, res) => {
  db.deleteFeedback(req.params.id);
  res.json({ success: true });
});

// ---------- 反思 / 综合 ----------
router.post('/reflect', async (req, res) => {
  const force = req.body?.force === true;
  const count = db.getObservationCount();
  const now = Date.now();
  // 自动节流：每新增 8 条观察或距上次 >10 分钟才综合，除非 force
  if (!force && count - lastSynthesizedCount < 8 && now - lastSynthesizedAt < 10 * 60 * 1000) {
    return res.json({ success: true, data: { skipped: true, reason: '观察不足，暂不综合' } });
  }
  lastSynthesizedCount = count;
  lastSynthesizedAt = now;

  const observations = db.getObservations(40).map(r => ({ ...r, detail: safeParse(r.detail) }));
  const existingH = db.getHypotheses().map(h => h.statement);
  const principles = db.getPrinciples().map(p => p.statement);

  let result = null;
  if (AI_API_KEY) {
    try {
      result = await aiSynthesize(observations, existingH, principles);
    } catch (e) {
      result = null;
    }
  }
  if (!result) {
    result = localSynthesize(observations, existingH);
  }

  // 落库：生成的假设
  for (const h of (result.hypotheses || [])) {
    try {
      db.createHypothesis({ ...h, evidence_ids: JSON.stringify(h.evidence_ids || []) });
    } catch {}
  }
  // 生成问题（仅当有未决问题且值得问）
  if (result.question && db.getQuestions('pending').length < 3) {
    db.createQuestion({
      question: result.question.q,
      reason: result.question.reason || 'AI 观察到需要确认的规划原则冲突或新模式',
      context: JSON.stringify(result.question.context || {}),
    });
  }

  res.json({ success: true, data: { hypotheses: result.hypotheses || [], question: result.question || null } });
});

// ---------- 工具函数 ----------
function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

function getFeedback() {
  try {
    return db.getDb().prepare('SELECT * FROM analyst_feedback ORDER BY created_at DESC LIMIT 50').all();
  } catch { return []; }
}

// 从回答中提炼"已确认原则"（简单启发式）
function extractPrincipleFromAnswer(q, answer) {
  const text = `${q.question} ${answer}`;
  const topic = (q.context && safeParse(q.context).topic) || '规划';
  const title = `关于「${topic}」的确认`;
  return { title, statement: answer.slice(0, 300), category: topic, confirmed_by: null };
}

// AI 合成（调用外部模型）
async function aiSynthesize(observations, existingH, principles) {
  const obsText = observations.map(o => `[${o.category}] ${JSON.stringify(o.detail)}`).join('\n');
  const prompt = `你是一位英语学习规划师的"方法论分析师"。基于以下对规划师(Andy)的观察记录，\n` +
    `1) 提炼出 1-3 条 Andy 的规划假设/规律（用【推测】语气，不要当成事实）\n` +
    `2) 如果发现 Andy 的某个决定与过去模式冲突、或存在规划原则冲突、或遇到新型学员、或置信度低，\n` +
    `   提出【一个】最有价值、最简短的澄清问题（用第一人称，像懂行的同事在问）。\n` +
    `只输出 JSON，格式：{"hypotheses":[{"title":"..","statement":"..","confidence":0.5}],"question":{"q":"..","reason":".."}}\n` +
    `已有假设：${existingH.join(' | ') || '无'}\n已确认原则：${principles.join(' | ') || '无'}\n观察记录：\n${obsText}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const res = await fetch(`${AI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.4 }),
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  try {
    return JSON.parse(content.replace(/```json|```/g, ''));
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('AI 输出无法解析');
  }
}

// 本地规则合成（无 API key 时的兜底）
function localSynthesize(observations, existingH) {
  const counts = {};
  for (const o of observations) counts[o.category] = (counts[o.category] || 0) + 1;
  const hypotheses = [];
  if (counts['record_advice'] >= 3 && counts['record_progress'] >= 3) {
    hypotheses.push({
      title: '进步与建议并重',
      statement: 'Andy 在回访中同时强调孩子进步与下一步建议，说明他重视"肯定+引导"的平衡。',
      confidence: 0.7,
    });
  }
  if (counts['view_student'] >= 5) {
    hypotheses.push({
      title: '高频查看学员档案',
      statement: 'Andy 会反复查看某些学员档案，可能是重点或疑难学员，值得优先关注。',
      confidence: 0.5,
    });
  }
  return { hypotheses, question: null };
}

export default router;