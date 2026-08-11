import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '../../data'));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'workbench.db');
let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    runBackup();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentPhone TEXT DEFAULT '',
      parentWechat TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      birthDate TEXT DEFAULT '',
      grade TEXT DEFAULT '',
      englishLevel TEXT DEFAULT '',
      activateDate TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      remindersDone TEXT DEFAULT '[]',
      createTime INTEGER NOT NULL,
      updateTime INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      wechatNickname TEXT NOT NULL,
      consultDate TEXT DEFAULT '',
      childAge TEXT DEFAULT '',
      childGrade TEXT DEFAULT '',
      englishLevel TEXT DEFAULT '',
      source TEXT DEFAULT '',
      concerns TEXT DEFAULT '[]',
      followStatus TEXT DEFAULT '新咨询',
      notes TEXT DEFAULT '',
      remindersDone TEXT DEFAULT '[]',
      createTime INTEGER NOT NULL,
      updateTime INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL,
      studentName TEXT DEFAULT '',
      reminderKey TEXT DEFAULT '',
      reminderTitle TEXT DEFAULT '',
      date TEXT DEFAULT '',
      parentFeedback TEXT DEFAULT '',
      childProblems TEXT DEFAULT '',
      childProgress TEXT DEFAULT '',
      teacherAdvice TEXT DEFAULT '',
      nextPlan TEXT DEFAULT '',
      createTime INTEGER NOT NULL,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS operation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity TEXT NOT NULL,
      entityId TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      timestamp INTEGER NOT NULL,
      clientId TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      relatedId TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      createTime INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency (
      operation_id TEXT PRIMARY KEY,
      result TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analyst_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId TEXT DEFAULT '',
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyst_hypotheses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      statement TEXT NOT NULL,
      evidence_ids TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.0,
      status TEXT DEFAULT 'active',
      note TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyst_principles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      statement TEXT NOT NULL,
      category TEXT DEFAULT '',
      confirmed_by INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyst_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      reason TEXT DEFAULT '',
      context TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      answered_at INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS analyst_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      answer_text TEXT NOT NULL,
      updated_principle INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (question_id) REFERENCES analyst_questions(id)
    );
    CREATE TABLE IF NOT EXISTS analyst_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      correction TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS case_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId TEXT NOT NULL,
      situation TEXT NOT NULL DEFAULT '{}',
      decision TEXT NOT NULL DEFAULT '{}',
      planning TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS case_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER DEFAULT NULL,
      studentId TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (case_id) REFERENCES case_decisions(id)
    );
    CREATE TABLE IF NOT EXISTS memory_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
  `);
}

function runBackup() {
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  // Auto backup every 6 hours (check on startup)
  const now = Date.now();
  const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
  const lastBackup = backups.length > 0
    ? Math.max(...backups.map(f => fs.statSync(path.join(backupDir, f)).mtimeMs))
    : 0;
  if (now - lastBackup > 6 * 60 * 60 * 1000) {
    const backupPath = path.join(backupDir, `workbench-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.db`);
    db.backup(backupPath);
    // Keep only last 10 backups
    const all = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort();
    while (all.length > 10) {
      fs.unlinkSync(path.join(backupDir, all.shift()));
    }
  }
}

// --- CRUD Helpers ---

export function logOperation(type, entity, entityId, data = {}, clientId = '') {
  const stmt = getDb().prepare(
    'INSERT INTO operation_log (type, entity, entityId, data, timestamp, clientId) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(type, entity, entityId, JSON.stringify(data), Date.now(), clientId);
}

export function getAllStudents() {
  const rows = getDb().prepare('SELECT * FROM students ORDER BY updateTime DESC').all();
  return rows.map(r => ({ ...r, remindersDone: JSON.parse(r.remindersDone || '[]') }));
}

export function getStudent(id) {
  const r = getDb().prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!r) return null;
  return { ...r, remindersDone: JSON.parse(r.remindersDone || '[]') };
}

export function createStudent(data) {
  const stmt = getDb().prepare(`
    INSERT INTO students (id, name, parentPhone, parentWechat, gender, birthDate, grade, englishLevel, activateDate, notes, remindersDone, createTime, updateTime)
    VALUES (@id, @name, @parentPhone, @parentWechat, @gender, @birthDate, @grade, @englishLevel, @activateDate, @notes, @remindersDone, @createTime, @updateTime)
  `);
  stmt.run({
    ...data,
    remindersDone: JSON.stringify(data.remindersDone || [])
  });
  return getStudent(data.id);
}

export function updateStudent(id, data) {
  const existing = getStudent(id);
  if (!existing) return null;
  const merged = { ...existing, ...data, updateTime: Date.now() };
  const stmt = getDb().prepare(`
    UPDATE students SET name=@name, parentPhone=@parentPhone, parentWechat=@parentWechat,
      gender=@gender, birthDate=@birthDate, grade=@grade, englishLevel=@englishLevel,
      activateDate=@activateDate, notes=@notes, remindersDone=@remindersDone, updateTime=@updateTime
    WHERE id=@id
  `);
  stmt.run({ ...merged, remindersDone: JSON.stringify(merged.remindersDone || []) });
  return getStudent(id);
}

export function deleteStudent(id) {
  getDb().prepare('DELETE FROM records WHERE studentId = ?').run(id);
  getDb().prepare('DELETE FROM students WHERE id = ?').run(id);
}

export function getAllLeads() {
  const rows = getDb().prepare('SELECT * FROM leads ORDER BY updateTime DESC').all();
  return rows.map(r => ({ ...r, remindersDone: JSON.parse(r.remindersDone || '[]'), concerns: JSON.parse(r.concerns || '[]') }));
}

export function getLead(id) {
  const r = getDb().prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!r) return null;
  return { ...r, remindersDone: JSON.parse(r.remindersDone || '[]'), concerns: JSON.parse(r.concerns || '[]') };
}

export function createLead(data) {
  const stmt = getDb().prepare(`
    INSERT INTO leads (id, wechatNickname, consultDate, childAge, childGrade, englishLevel, source, concerns, followStatus, notes, remindersDone, createTime, updateTime)
    VALUES (@id, @wechatNickname, @consultDate, @childAge, @childGrade, @englishLevel, @source, @concerns, @followStatus, @notes, @remindersDone, @createTime, @updateTime)
  `);
  stmt.run({
    ...data,
    concerns: JSON.stringify(data.concerns || []),
    remindersDone: JSON.stringify(data.remindersDone || [])
  });
  return getLead(data.id);
}

export function updateLead(id, data) {
  const existing = getLead(id);
  if (!existing) return null;
  const merged = { ...existing, ...data, updateTime: Date.now() };
  const stmt = getDb().prepare(`
    UPDATE leads SET wechatNickname=@wechatNickname, consultDate=@consultDate,
      childAge=@childAge, childGrade=@childGrade, englishLevel=@englishLevel,
      source=@source, concerns=@concerns, followStatus=@followStatus,
      notes=@notes, remindersDone=@remindersDone, updateTime=@updateTime
    WHERE id=@id
  `);
  stmt.run({ ...merged, concerns: JSON.stringify(merged.concerns || []), remindersDone: JSON.stringify(merged.remindersDone || []) });
  return getLead(id);
}

export function deleteLead(id) {
  getDb().prepare('DELETE FROM leads WHERE id = ?').run(id);
}

export function getAllRecords(studentId) {
  if (studentId) {
    return getDb().prepare('SELECT * FROM records WHERE studentId = ? ORDER BY date DESC').all(studentId);
  }
  return getDb().prepare('SELECT * FROM records ORDER BY date DESC').all();
}

export function getRecord(id) {
  return getDb().prepare('SELECT * FROM records WHERE id = ?').get(id);
}

export function createRecord(data) {
  const stmt = getDb().prepare(`
    INSERT INTO records (id, studentId, studentName, reminderKey, reminderTitle, date, parentFeedback, childProblems, childProgress, teacherAdvice, nextPlan, createTime)
    VALUES (@id, @studentId, @studentName, @reminderKey, @reminderTitle, @date, @parentFeedback, @childProblems, @childProgress, @teacherAdvice, @nextPlan, @createTime)
  `);
  stmt.run(data);
  return getRecord(data.id);
}

export function updateRecord(id, data) {
  const existing = getRecord(id);
  if (!existing) return null;
  const merged = { ...existing, ...data };
  const stmt = getDb().prepare(`
    UPDATE records SET date=@date, parentFeedback=@parentFeedback, childProblems=@childProblems,
      childProgress=@childProgress, teacherAdvice=@teacherAdvice, nextPlan=@nextPlan
    WHERE id=@id
  `);
  stmt.run(merged);
  return getRecord(id);
}

export function deleteRecord(id) {
  getDb().prepare('DELETE FROM records WHERE id = ?').run(id);
}

export function getRecentLogs(limit = 50) {
  return getDb().prepare('SELECT * FROM operation_log ORDER BY timestamp DESC LIMIT ?').all(limit);
}

export function getAiSuggestions(type, status) {
  let sql = 'SELECT * FROM ai_suggestions WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY createTime DESC';
  return getDb().prepare(sql).all(...params);
}

export function createAiSuggestion(data) {
  const stmt = getDb().prepare(`
    INSERT INTO ai_suggestions (type, title, content, relatedId, status, createTime)
    VALUES (@type, @title, @content, @relatedId, @status, @createTime)
  `);
  stmt.run({ ...data, createTime: Date.now() });
  return getDb().prepare('SELECT * FROM ai_suggestions WHERE id = last_insert_rowid()').get();
}

export function updateAiSuggestion(id, data) {
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(data);
  getDb().prepare(`UPDATE ai_suggestions SET ${sets} WHERE id = ?`).run(...vals, id);
  return getDb().prepare('SELECT * FROM ai_suggestions WHERE id = ?').get(id);
}

// ---- Idempotency ----
const IDEMPOTENCY_TTL = 1000 * 60 * 60 * 24; // 24 hours

export function checkIdempotency(operationId) {
  if (!operationId) return null;
  const row = getDb().prepare('SELECT result FROM idempotency WHERE operation_id = ? AND timestamp > ?').get(operationId, Date.now() - IDEMPOTENCY_TTL);
  if (row) {
    try { return JSON.parse(row.result); } catch { return null; }
  }
  return null;
}

export function saveIdempotency(operationId, result) {
  if (!operationId) return;
  getDb().prepare('INSERT OR REPLACE INTO idempotency (operation_id, result, timestamp) VALUES (?, ?, ?)').run(operationId, JSON.stringify(result), Date.now());
  // Cleanup old entries
  getDb().prepare('DELETE FROM idempotency WHERE timestamp < ?').run(Date.now() - IDEMPOTENCY_TTL);
}

// ---- Analyst Learning System ----
const NOW = () => Date.now();

export function createObservation(data) {
  return getDb().prepare(`
    INSERT INTO analyst_observations (studentId, category, source, detail, created_at)
    VALUES (@studentId, @category, @source, @detail, @created_at)
  `).run({ ...data, created_at: NOW() });
}

export function getObservations(limit = 50, studentId = null) {
  let q = 'SELECT * FROM analyst_observations';
  const params = [];
  if (studentId) { q += ' WHERE studentId = ?'; params.push(studentId); }
  q += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(q).all(...params);
}

export function getObservationCount() {
  return getDb().prepare('SELECT COUNT(*) as c FROM analyst_observations').get().c;
}

export function createHypothesis(data) {
  return getDb().prepare(`
    INSERT INTO analyst_hypotheses (title, statement, evidence_ids, confidence, status, note, created_at, updated_at)
    VALUES (@title, @statement, @evidence_ids, @confidence, @status, @note, @created_at, @updated_at)
  `).run({ ...data, status: data.status || 'active', note: data.note || '', created_at: NOW(), updated_at: NOW() });
}

export function getHypotheses(status = null) {
  let q = 'SELECT * FROM analyst_hypotheses';
  const params = [];
  if (status) { q += ' WHERE status = ?'; params.push(status); }
  q += ' ORDER BY confidence DESC, updated_at DESC';
  return getDb().prepare(q).all(...params);
}

export function updateHypothesis(id, data) {
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(data);
  getDb().prepare(`UPDATE analyst_hypotheses SET ${sets}, updated_at = ? WHERE id = ?`).run(...vals, NOW(), id);
  return getDb().prepare('SELECT * FROM analyst_hypotheses WHERE id = ?').get(id);
}

export function createPrinciple(data) {
  return getDb().prepare(`
    INSERT INTO analyst_principles (title, statement, category, confirmed_by, created_at)
    VALUES (@title, @statement, @category, @confirmed_by, @created_at)
  `).run({ ...data, created_at: NOW() });
}

export function getPrinciples() {
  return getDb().prepare('SELECT * FROM analyst_principles ORDER BY created_at DESC').all();
}

export function deletePrinciple(id) {
  return getDb().prepare('DELETE FROM analyst_principles WHERE id = ?').run(id);
}

export function createQuestion(data) {
  return getDb().prepare(`
    INSERT INTO analyst_questions (question, reason, context, status, created_at)
    VALUES (@question, @reason, @context, @status, @created_at)
  `).run({ ...data, status: 'pending', created_at: NOW() });
}

export function getQuestions(status = null) {
  let q = 'SELECT * FROM analyst_questions';
  const params = [];
  if (status) { q += ' WHERE status = ?'; params.push(status); }
  q += ' ORDER BY created_at DESC';
  return getDb().prepare(q).all(...params);
}

export function updateQuestion(id, data) {
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(data);
  if (data.answered_at) getDb().prepare(`UPDATE analyst_questions SET ${sets} WHERE id = ?`).run(...vals, id);
  else getDb().prepare(`UPDATE analyst_questions SET ${sets} WHERE id = ?`).run(...vals, id);
  return getDb().prepare('SELECT * FROM analyst_questions WHERE id = ?').get(id);
}

export function createAnswer(data) {
  return getDb().prepare(`
    INSERT INTO analyst_answers (question_id, answer_text, updated_principle, created_at)
    VALUES (@question_id, @answer_text, @updated_principle, @created_at)
  `).run({ ...data, created_at: NOW() });
}

export function getAnswers(questionId = null) {
  let q = 'SELECT * FROM analyst_answers';
  const params = [];
  if (questionId) { q += ' WHERE question_id = ?'; params.push(questionId); }
  q += ' ORDER BY created_at DESC';
  return getDb().prepare(q).all(...params);
}

export function createFeedback(data) {
  return getDb().prepare(`
    INSERT INTO analyst_feedback (target_type, target_id, correction, created_at)
    VALUES (@target_type, @target_id, @correction, @created_at)
  `).run({ ...data, created_at: NOW() });
}

export function deleteFeedback(id) {
  return getDb().prepare('DELETE FROM analyst_feedback WHERE id = ?').run(id);
}

export function createCaseDecision(data) {
  return getDb().prepare(`
    INSERT INTO case_decisions (studentId, situation, decision, planning, created_at)
    VALUES (@studentId, @situation, @decision, @planning, @created_at)
  `).run({ ...data, created_at: NOW() });
}

export function getCaseDecisions(studentId = null) {
  let q = 'SELECT * FROM case_decisions';
  const params = [];
  if (studentId) { q += ' WHERE studentId = ?'; params.push(studentId); }
  q += ' ORDER BY created_at DESC';
  return getDb().prepare(q).all(...params);
}

export function createCaseOutcome(data) {
  return getDb().prepare(`
    INSERT INTO case_outcomes (case_id, studentId, outcome, created_at)
    VALUES (@case_id, @studentId, @outcome, @created_at)
  `).run({ ...data, created_at: NOW() });
}

export function getCaseOutcomes(studentId = null) {
  let q = 'SELECT * FROM case_outcomes';
  const params = [];
  if (studentId) { q += ' WHERE studentId = ?'; params.push(studentId); }
  q += ' ORDER BY created_at DESC';
  return getDb().prepare(q).all(...params);
}

export function getAnalystStatus() {
  return {
    observations: getObservationCount(),
    hypotheses: getDb().prepare('SELECT COUNT(*) as c FROM analyst_hypotheses WHERE status = ?').get('active').c,
    principles: getDb().prepare('SELECT COUNT(*) as c FROM analyst_principles').get().c,
    pendingQuestions: getDb().prepare('SELECT COUNT(*) as c FROM analyst_questions WHERE status = ?').get('pending').c,
  };
}
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}