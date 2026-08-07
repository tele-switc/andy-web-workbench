import { Router } from 'express';
import * as db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const { studentId } = req.query;
  const list = db.getAllRecords(studentId || null);
  res.json({ success: true, data: list });
});

router.get('/:id', (req, res) => {
  const r = db.getRecord(req.params.id);
  if (!r) return res.status(404).json({ success: false, error: '记录不存在' });
  res.json({ success: true, data: r });
});

router.post('/', (req, res) => {
  const { studentId, date, operation_id } = req.body;
  if (operation_id) {
    const existing = db.checkIdempotency(operation_id);
    if (existing) return res.json(existing);
  }
  if (!studentId) return res.status(400).json({ success: false, error: '学员ID为必填' });
  const now = Date.now();
  const data = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    studentId,
    studentName: req.body.studentName || '',
    reminderKey: req.body.reminderKey || '',
    reminderTitle: req.body.reminderTitle || '',
    date: date || new Date().toISOString().slice(0, 10),
    parentFeedback: req.body.parentFeedback || '',
    childProblems: req.body.childProblems || '',
    childProgress: req.body.childProgress || '',
    teacherAdvice: req.body.teacherAdvice || '',
    nextPlan: req.body.nextPlan || '',
    createTime: now
  };
  const record = db.createRecord(data);
  db.logOperation('create', 'record', data.id, { studentId, reminderTitle: data.reminderTitle });
  const result = { success: true, data: record };
  if (operation_id) db.saveIdempotency(operation_id, result);
  res.status(201).json(result);
});

router.put('/:id', (req, res) => {
  const existing = db.getRecord(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: '记录不存在' });
  const record = db.updateRecord(req.params.id, req.body);
  db.logOperation('update', 'record', req.params.id, {});
  res.json({ success: true, data: record });
});

router.delete('/:id', (req, res) => {
  const existing = db.getRecord(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: '记录不存在' });
  db.deleteRecord(req.params.id);
  db.logOperation('delete', 'record', req.params.id, {});
  res.json({ success: true });
});

export default router;