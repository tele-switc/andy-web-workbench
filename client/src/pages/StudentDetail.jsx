import React, { useState } from 'react';
import * as api from '../api';

const STUDENT_MILESTONES = [
  { key: 'd7', days: 7, title: '首次学习回访' },
  { key: 'd30', days: 30, title: '一个月学习反馈' },
  { key: 'd90', days: 90, title: '三个月成长回访' },
  { key: 'd180', days: 180, title: '半年阶段复盘' },
  { key: 'd365', days: 365, title: '年度成长反馈' },
  { key: 'd730', days: 730, title: '两年学习复盘' },
  { key: 'd1095', days: 1095, title: '三年成长总结' },
];

export default function StudentDetail({ data, navigate, params, refreshData }) {
  const s = data.students.find(x => x.id === params.id);
  const [showForm, setShowForm] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [recordForm, setRecordForm] = useState({});
  const [editRecord, setEditRecord] = useState(null);
  const [deleting, setDeleting] = useState(false);

  if (!s) {
    navigate('students');
    return null;
  }

  const records = data.records
    .filter(r => r.studentId === s.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const today = new Date().toISOString().slice(0, 10);
  const done = s.remindersDone || [];
  const nextMilestone = STUDENT_MILESTONES.find(m => {
    if (done.includes(m.key)) return false;
    if (!s.activateDate) return false;
    const d = new Date(s.activateDate);
    d.setDate(d.getDate() + m.days);
    return d.toISOString().slice(0, 10) >= today;
  });

  const nextDue = nextMilestone && s.activateDate ? (() => {
    const d = new Date(s.activateDate);
    d.setDate(d.getDate() + nextMilestone.days);
    return d.toISOString().slice(0, 10);
  })() : null;

  const handleDelete = async () => {
    try {
      await api.deleteStudent(s.id);
      refreshData();
      navigate('students');
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleSaveRecord = async () => {
    if (!recordForm.parentFeedback && !recordForm.childProblems && !recordForm.childProgress && !recordForm.teacherAdvice) {
      alert('请至少填写一项回访内容');
      return;
    }
    try {
      if (editRecord) {
        await api.updateRecord(editRecord.id, recordForm);
      } else {
        await api.createRecord({
          studentId: s.id,
          studentName: s.name,
          reminderKey: recordForm.reminderKey || '',
          reminderTitle: recordForm.reminderTitle || '',
          date: recordForm.date || today,
          parentFeedback: recordForm.parentFeedback || '',
          childProblems: recordForm.childProblems || '',
          childProgress: recordForm.childProgress || '',
          teacherAdvice: recordForm.teacherAdvice || '',
          nextPlan: recordForm.nextPlan || '',
        });
        // Mark reminder done if applicable
        if (recordForm.reminderKey) {
          const doneArr = [...(s.remindersDone || [])];
          if (!doneArr.includes(recordForm.reminderKey)) {
            doneArr.push(recordForm.reminderKey);
            await api.updateStudent(s.id, { remindersDone: doneArr });
          }
        }
      }
      setShowRecord(false);
      setRecordForm({});
      setEditRecord(null);
      refreshData();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  };

  const openRecordForm = (record, reminder) => {
    if (record) {
      setEditRecord(record);
      setRecordForm({ ...record });
    } else {
      setEditRecord(null);
      setRecordForm({
        date: today,
        reminderKey: reminder?.key || '',
        reminderTitle: reminder?.title || '',
      });
    }
    setShowRecord(true);
  };

  const handleDeleteRecord = async (id) => {
    try {
      await api.deleteRecord(id);
      refreshData();
      setShowRecord(false);
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  return (
    <div>
      {/* Back bar */}
      <div className="back-bar">
        <button className="back" onClick={() => navigate('students')}>‹</button>
        <div className="tt">学员详情</div>
        <button className="act" onClick={() => setShowForm(true)}>编辑</button>
      </div>

      {/* Info Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar lg">{s.name.charAt(0)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {s.name}
              {s.gender && <span className="tag neutral" style={{ marginLeft: 8 }}>{s.gender}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              激活日期：{s.activateDate || '—'}
            </div>
          </div>
          <button className="btn danger sm" onClick={() => { if (window.confirm('确定删除该学员？')) handleDelete(); }}>删除</button>
        </div>
        <div className="divider" />
        <div className="detail-row"><span className="k">家长手机号</span><span className="v">{s.parentPhone || '—'}</span></div>
        <div className="detail-row"><span className="k">家长微信</span><span className="v">{s.parentWechat || '—'}</span></div>
        <div className="detail-row"><span className="k">出生年月</span><span className="v">{s.birthDate || '—'}</span></div>
        <div className="detail-row"><span className="k">年级</span><span className="v">{s.grade || '—'}</span></div>
        <div className="detail-row"><span className="k">英语基础</span><span className="v">{s.englishLevel || '—'}</span></div>
        {s.notes && <div className="detail-row"><span className="k">备注</span><span className="v">{s.notes}</span></div>}
      </div>

      {/* Next Milestone */}
      <div className="card">
        <div className="card-title-row">
          <span className="card-title">下次回访</span>
          <span className="card-link">自动按激活日期计算</span>
        </div>
        {!nextMilestone ? (
          <div style={{ color: 'var(--success)', fontSize: 13 }}>🎉 全部回访节点已完成</div>
        ) : (
          <div className="item-row" style={{ border: 'none', padding: '4px 0', cursor: 'pointer' }}
            onClick={() => openRecordForm(null, nextMilestone)}>
            <div className="item-body">
              <div className="item-name">{nextMilestone.title}</div>
              <div className="item-meta">{nextDue}{nextDue < today ? '（已到期）' : ''}</div>
            </div>
            <span className="item-action">去记录 ›</span>
          </div>
        )}
      </div>

      {/* Records */}
      <div className="card">
        <div className="card-title-row">
          <span className="card-title">回访记录</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>共 {records.length} 条</span>
          <button className="btn primary sm" onClick={() => openRecordForm(null, null)}>＋ 新增</button>
        </div>
        {records.length === 0 ? (
          <div className="empty" style={{ padding: '14px 0' }}>还没有回访记录</div>
        ) : (
          records.map(r => (
            <div key={r.id} className="tl-item" onClick={() => openRecordForm(r, null)}>
              <div className="tl-dot" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>✓</div>
              <div className="tl-body">
                <div className="tl-title">{r.reminderTitle || '手动回访'}</div>
                <div className="tl-sub">{r.date}{r.parentFeedback ? ' · ' + r.parentFeedback.slice(0, 24) : ''}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Student Form */}
      {showForm && (
        <StudentForm s={s} onClose={() => setShowForm(false)} onSave={async (data) => {
          await api.updateStudent(s.id, data);
          refreshData();
          setShowForm(false);
        }} />
      )}

      {/* Record Form */}
      {showRecord && (
        <RecordForm
          record={editRecord}
          reminderTitle={recordForm.reminderTitle}
          reminderKey={recordForm.reminderKey}
          form={recordForm}
          onChange={setRecordForm}
          onSave={handleSaveRecord}
          onDelete={editRecord ? () => handleDeleteRecord(editRecord.id) : null}
          onClose={() => { setShowRecord(false); setEditRecord(null); }}
        />
      )}
    </div>
  );
}

function StudentForm({ s, onClose, onSave }) {
  const [form, setForm] = useState({ ...s });
  const GENDERS = ['男', '女'];
  const ENGLISH_LEVELS = ['零基础', '启蒙阶段', '有英语学习基础'];

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose(); }}>
      <div className="sheet">
        <div className="sheet-head">
          <div className="tt">编辑学员</div>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="form-group">
          <label className="form-label">姓名 <span className="req">*</span></label>
          <input className="form-input" value={form.name || ''}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">家长手机号</label>
          <input className="form-input" value={form.parentPhone || ''}
            onChange={e => setForm(f => ({ ...f, parentPhone: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">性别</label>
          <div className="chips" style={{ display: 'flex', gap: 8 }}>
            {GENDERS.map(g => (
              <span key={g} className={`chip ${form.gender === g ? 'selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, gender: g }))}>{g}</span>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">年级</label>
          <input className="form-input" value={form.grade || ''}
            onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">英语基础</label>
          <div className="chips" style={{ display: 'flex', gap: 8 }}>
            {ENGLISH_LEVELS.map(l => (
              <span key={l} className={`chip ${form.englishLevel === l ? 'selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, englishLevel: l }))}>{l}</span>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">激活日期</label>
          <input className="form-input" type="date" value={form.activateDate || ''}
            onChange={e => setForm(f => ({ ...f, activateDate: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">备注</label>
          <textarea className="form-textarea" value={form.notes || ''}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="sheet-actions">
          <button className="btn neutral" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={() => {
            if (!form.name || !form.activateDate) { alert('请填写姓名和激活日期'); return; }
            onSave(form);
          }}>保存</button>
        </div>
      </div>
    </div>
  );
}

function RecordForm({ record, reminderTitle, reminderKey, form, onChange, onSave, onDelete, onClose }) {
  const isEdit = !!record;
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose(); }}>
      <div className="sheet">
        <div className="sheet-head">
          <div className="tt">{isEdit ? '编辑回访' : '新增回访'}</div>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        {reminderTitle && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>{reminderTitle}</div>}
        <div className="form-group">
          <label className="form-label">回访日期</label>
          <input className="form-input" type="date" value={form.date || ''}
            onChange={e => onChange(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">家长反馈</label>
          <textarea className="form-textarea" placeholder="家长对课程/服务的反馈" value={form.parentFeedback || ''}
            onChange={e => onChange(f => ({ ...f, parentFeedback: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">孩子遇到的问题</label>
          <textarea className="form-textarea" placeholder="学习中遇到的困难" value={form.childProblems || ''}
            onChange={e => onChange(f => ({ ...f, childProblems: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">孩子进步表现</label>
          <textarea className="form-textarea" placeholder="值得肯定的进步点" value={form.childProgress || ''}
            onChange={e => onChange(f => ({ ...f, childProgress: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">老师反馈建议</label>
          <textarea className="form-textarea" placeholder="给家长和孩子的建议" value={form.teacherAdvice || ''}
            onChange={e => onChange(f => ({ ...f, teacherAdvice: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">下一阶段计划</label>
          <textarea className="form-textarea" placeholder="下阶段学习安排" value={form.nextPlan || ''}
            onChange={e => onChange(f => ({ ...f, nextPlan: e.target.value }))} />
        </div>
        <div className="sheet-actions">
          {isEdit && <button className="btn danger" onClick={onDelete}>删除</button>}
          <button className="btn neutral" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}