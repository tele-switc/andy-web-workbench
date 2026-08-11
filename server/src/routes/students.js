import { Router } from 'express';
import * as db from '../db/index.js';
import { broadcastChange } from '../ws/index.js';

const router = Router();

function observe(category, studentId, detail) {
  try {
    db.createObservation({ studentId: studentId || '', category, source: 'students', detail: JSON.stringify(detail || {}) });
  } catch {}
}

// GET /api/students — list all
router.get('/', (req, res) => {
  const list = db.getAllStudents();
  res.json({ success: true, data: list });
});

// GET /api/students/:id — single
router.get('/:id', (req, res) => {
  const s = db.getStudent(req.params.id);
  if (!s) return res.status(404).json({ success: false, error: '学员不存在' });
  res.json({ success: true, data: s });
});

// POST /api/students — create
router.post('/', (req, res) => {
  const { name, activateDate, operation_id } = req.body;
  // Idempotency: if this operation was already applied, return the previous result
  if (operation_id) {
    const existing = db.checkIdempotency(operation_id);
    if (existing) return res.json(existing);
  }
  if (!name || !activateDate) {
    return res.status(400).json({ success: false, error: '姓名和激活日期为必填' });
  }
  const now = Date.now();
  const data = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name,
    parentPhone: req.body.parentPhone || '',
    parentWechat: req.body.parentWechat || '',
    gender: req.body.gender || '',
    birthDate: req.body.birthDate || '',
    grade: req.body.grade || '',
    englishLevel: req.body.englishLevel || '',
    activateDate,
    notes: req.body.notes || '',
    remindersDone: [],
    createTime: now,
    updateTime: now
  };
  const student = db.createStudent(data);
  db.logOperation('create', 'student', data.id, { name });
  const result = { success: true, data: student };
  if (operation_id) db.saveIdempotency(operation_id, result);
  broadcastChange('student', 'create', student);
  res.status(201).json(result);
});

// PUT /api/students/:id — update
router.put('/:id', (req, res) => {
  const existing = db.getStudent(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: '学员不存在' });
  const student = db.updateStudent(req.params.id, req.body);
  db.logOperation('update', 'student', req.params.id, { name: req.body.name });
  broadcastChange('student', 'update', student);
  observe('student_updated', req.params.id, { fields: Object.keys(req.body), notes: req.body.notes?.slice(0, 200) });
  res.json({ success: true, data: student });
});

// DELETE /api/students/:id — delete
router.delete('/:id', (req, res) => {
  const existing = db.getStudent(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: '学员不存在' });
  db.deleteStudent(req.params.id);
  db.logOperation('delete', 'student', req.params.id, { name: existing.name });
  broadcastChange('student', 'delete', { id: req.params.id });
  res.json({ success: true });
});

export default router;