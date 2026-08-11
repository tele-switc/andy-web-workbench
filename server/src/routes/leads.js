import { Router } from 'express';
import * as db from '../db/index.js';
import { broadcastChange } from '../ws/index.js';

const router = Router();

function observe(category, leadId, detail) {
  try {
    db.createObservation({ studentId: leadId || '', category, source: 'leads', detail: JSON.stringify(detail || {}) });
  } catch {}
}

router.get('/', (req, res) => {
  const list = db.getAllLeads();
  res.json({ success: true, data: list });
});

router.get('/:id', (req, res) => {
  const l = db.getLead(req.params.id);
  if (!l) return res.status(404).json({ success: false, error: '意向学员不存在' });
  res.json({ success: true, data: l });
});

router.post('/', (req, res) => {
  const { wechatNickname, consultDate, operation_id } = req.body;
  if (operation_id) {
    const existing = db.checkIdempotency(operation_id);
    if (existing) return res.json(existing);
  }
  if (!wechatNickname) {
    return res.status(400).json({ success: false, error: '家长微信昵称为必填' });
  }
  const now = Date.now();
  const data = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    wechatNickname,
    consultDate: consultDate || '',
    childAge: req.body.childAge || '',
    childGrade: req.body.childGrade || '',
    englishLevel: req.body.englishLevel || '',
    source: req.body.source || '',
    concerns: req.body.concerns || [],
    followStatus: req.body.followStatus || '新咨询',
    notes: req.body.notes || '',
    remindersDone: [],
    createTime: now,
    updateTime: now
  };
  const lead = db.createLead(data);
  db.logOperation('create', 'lead', data.id, { wechatNickname });
  const result = { success: true, data: lead };
  if (operation_id) db.saveIdempotency(operation_id, result);
  broadcastChange('lead', 'create', lead);
  res.status(201).json(result);
});

router.put('/:id', (req, res) => {
  const existing = db.getLead(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: '意向学员不存在' });
  const lead = db.updateLead(req.params.id, req.body);
  db.logOperation('update', 'lead', req.params.id, { wechatNickname: req.body.wechatNickname });
  broadcastChange('lead', 'update', lead);
  res.json({ success: true, data: lead });
});

router.delete('/:id', (req, res) => {
  const existing = db.getLead(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: '意向学员不存在' });
  db.deleteLead(req.params.id);
  db.logOperation('delete', 'lead', req.params.id, { wechatNickname: existing.wechatNickname });
  broadcastChange('lead', 'delete', { id: req.params.id });
  res.json({ success: true });
});

// POST /api/leads/:id/convert — convert lead to student
router.post('/:id/convert', (req, res) => {
  const l = db.getLead(req.params.id);
  if (!l) return res.status(404).json({ success: false, error: '意向学员不存在' });
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const studentData = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: l.wechatNickname,
    parentPhone: '',
    parentWechat: l.wechatNickname,
    gender: '',
    birthDate: '',
    grade: l.childGrade,
    englishLevel: l.englishLevel,
    activateDate: today,
    notes: `由意向学员转化（${l.consultDate || ''} 咨询${l.source ? '，来源：' + l.source : ''}）`,
    remindersDone: ['d7'],
    createTime: now,
    updateTime: now
  };
  const student = db.createStudent(studentData);
  db.updateLead(req.params.id, { followStatus: '已转正式', updateTime: now });
  db.logOperation('convert', 'lead', l.id, { studentId: studentData.id });
  broadcastChange('student', 'create', student);
  broadcastChange('lead', 'update', db.getLead(req.params.id));
  res.status(201).json({ success: true, data: { student, lead: db.getLead(req.params.id) } });
});

export default router;