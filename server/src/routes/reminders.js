import { Router } from 'express';
import * as db from '../db/index.js';
import { broadcastChange } from '../ws/index.js';

const router = Router();

// Milestone definitions
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000);
}

function calcStudentReminders(s) {
  const t = today();
  const done = s.remindersDone || [];
  return STUDENT_MILESTONES
    .filter(m => !done.includes(m.key) && s.activateDate)
    .map(m => {
      const due = addDays(s.activateDate, m.days);
      if (due > t) return null;
      return {
        ownerId: s.id, ownerName: s.name, key: m.key, title: m.title,
        dueDate: due, days: m.days, overdue: due < t, isStudent: true
      };
    })
    .filter(Boolean);
}

function calcLeadReminders(l) {
  const t = today();
  const done = l.remindersDone || [];
  return LEAD_MILESTONES
    .filter(m => !done.includes(m.key) && l.consultDate)
    .map(m => {
      const due = addDays(l.consultDate, m.days);
      if (due > t) return null;
      return {
        ownerId: l.id, ownerName: l.wechatNickname, key: m.key, title: m.title,
        dueDate: due, days: m.days, overdue: due < t, isStudent: false
      };
    })
    .filter(Boolean);
}

// GET /api/reminders — all due reminders
router.get('/', (req, res) => {
  const students = db.getAllStudents();
  const leads = db.getAllLeads();
  const all = [
    ...students.flatMap(calcStudentReminders),
    ...leads.flatMap(calcLeadReminders)
  ];
  all.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
  });
  res.json({ success: true, data: all });
});

// GET /api/reminders/stats — summary counts
router.get('/stats', (req, res) => {
  const students = db.getAllStudents();
  const leads = db.getAllLeads();
  const all = [
    ...students.flatMap(calcStudentReminders),
    ...leads.flatMap(calcLeadReminders)
  ];
  res.json({
    success: true,
    data: {
      total: all.length,
      overdue: all.filter(r => r.overdue).length,
      today: all.filter(r => !r.overdue).length,
      studentCount: all.filter(r => r.isStudent).length,
      leadCount: all.filter(r => !r.isStudent).length
    }
  });
});

// POST /api/reminders/done — mark reminder complete
router.post('/done', (req, res) => {
  const { ownerId, key, isStudent } = req.body;
  if (!ownerId || !key) return res.status(400).json({ success: false, error: '参数不足' });
  if (isStudent) {
    const s = db.getStudent(ownerId);
    if (!s) return res.status(404).json({ success: false, error: '学员不存在' });
    const done = s.remindersDone || [];
    if (!done.includes(key)) done.push(key);
    db.updateStudent(ownerId, { remindersDone: done });
  } else {
    const l = db.getLead(ownerId);
    if (!l) return res.status(404).json({ success: false, error: '意向学员不存在' });
    const done = l.remindersDone || [];
    if (!done.includes(key)) done.push(key);
    db.updateLead(ownerId, { remindersDone: done });
  }
  db.logOperation('done', 'reminder', ownerId, { key });
  broadcastChange('reminder', 'done', { ownerId, key, isStudent });
  res.json({ success: true });
});

export default router;