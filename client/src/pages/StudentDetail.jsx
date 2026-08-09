import React, { useState } from 'react';
import * as api from '../api';
import { calcStudentReminders, stageLabel, durationText, todayStr } from '../lib/reminders';

export default function StudentDetail({ data, navigate, params, refreshData }) {
  const s = data.students.find(x => x.id === params.id);
  const [showForm, setShowForm] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [recordForm, setRecordForm] = useState({});
  const [editRecord, setEditRecord] = useState(null);

  if (!s) {
    navigate('students');
    return null;
  }

  const today = todayStr();
  const records = data.records
    .filter(r => r.studentId === s.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const done = s.remindersDone || [];
  const dueReminders = calcStudentReminders(s, today);

  const age = s.birthDate ? Math.floor((new Date(today) - new Date(s.birthDate)) / (365.25 * 86400000)) : null;
  const stage = stageLabel(s, today);
  const duration = durationText(s, today);

  // 阶段总结（自动生成）
  const progressCount = records.filter(r => r.childProgress).length;
  const problemsCount = records.filter(r => r.childProblems).length;
  const lastRecord = records[0];
  const summary = records.length === 0
    ? '还没有回访记录。完成第一次回访后，这里会自动生成阶段总结。'
    : `共 ${records.length} 次回访，${progressCount} 次记录到进步，${problemsCount} 次提到困难。` +
      (lastRecord?.childProgress ? `最近进步：${lastRecord.childProgress.slice(0, 60)}` : '') +
      (dueReminders.length > 0 ? ` 当前有 ${dueReminders.length} 项回访待跟进。` : ' 当前回访节点都已跟进。');

  const handleDelete = async () => {
    if (!window.confirm(`确定删除学员「${s.name}」？相关回访记录也会被删除。`)) return;
    try {
      await api.deleteStudent(s.id);
      refreshData();
      navigate('students');
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleSaveRecord = async () => {
    const has = recordForm.parentFeedback || recordForm.childProblems || recordForm.childProgress || recordForm.teacherAdvice || recordForm.nextPlan;
    if (!has) { alert('请至少填写一项回访内容'); return; }
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
    if (!window.confirm('确定删除这条回访记录？')) return;
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
      <div className="back-bar">
        <button className="back" onClick={() => navigate('students')} aria-label="返回">‹</button>
        <div className="tt">成长档案</div>
        <button className="act" onClick={() => setShowForm(true)}>编辑</button>
      </div>

      {/* 顶部档案卡 */}
      <div className="profile-card">
        <div className="profile-top">
          <div className="avatar lg">{s.name.charAt(0)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">
              {s.name}
              {s.gender && <span className="tag soft">{s.gender}</span>}
              <span className="tag sage">{stage}</span>
            </div>
            <div className="profile-sub">
              {s.grade || '未填年级'}{s.parentWechat ? ' · ' + s.parentWechat : ''}{s.parentPhone ? ' · ' + s.parentPhone : ''}
            </div>
          </div>
          <button className="btn danger sm" onClick={handleDelete}>删除</button>
        </div>

        <div className="stat-grid">
          <div className="stat-cell"><div className="v">{age ?? '—'}</div><div className="k">年龄</div></div>
          <div className="stat-cell"><div className="v">{duration}</div><div className="k">学习时长</div></div>
          <div className="stat-cell"><div className="v">{records.length}</div><div className="k">回访次数</div></div>
        </div>
      </div>

      {/* 当前状态 + 下次回访 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">当前状态</span>
          <span className="card-sub">激活于 {s.activateDate || '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className={`tag ${dueReminders.length > 0 ? 'rose' : 'sage'}`}>
            {dueReminders.length > 0 ? `需关注 · ${dueReminders.length} 项回访待跟进` : '状态良好'}
          </span>
        </div>
        {dueReminders.length > 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
            最近的待办回访：
            {dueReminders.slice(0, 3).map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 6 }}>
                <span>{r.title} · {r.dueDate}</span>
                <button className="btn primary sm" onClick={() => openRecordForm(null, r)}>去记录</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
            所有回访节点都已跟进。可以在下面添加新的回访记录，或手动记录一次成长。
          </div>
        )}
      </div>

      {/* 阶段总结 */}
      <div className="stage-box">
        <div className="t">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 5.5L20 9l-5.5 1.5L12 16l-2.5-5.5L4 9l5.5-1.5L12 2z"/><path d="M19 14l1 2.2 2.2 1-2.2 1L19 20.4l-1-2.2-2.2-1 2.2-1L19 14z"/></svg>
          阶段总结
        </div>
        <div className="c">{summary}</div>
      </div>

      {/* 时间轴：历次回访 */}
      <div className="card" style={{ paddingBottom: 20 }}>
        <div className="card-head">
          <span className="card-title">成长时间轴</span>
          <span className="card-sub">{records.length} 次回访</span>
          <button className="btn primary sm" onClick={() => openRecordForm(null, null)}>＋ 记一次</button>
        </div>
        {records.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0 6px' }}>
            <div className="big">📓</div>
            <div>还没有回访记录，点击右上角「＋ 记一次」</div>
          </div>
        ) : (
          <div className="timeline">
            {records.map(r => (
              <div key={r.id} className={`tl-node ${r.childProgress ? 'done' : r.childProblems ? 'amber' : ''}`}>
                <div className="tl-card" onClick={() => openRecordForm(r, null)} style={{ cursor: 'pointer' }}>
                  <div className="tl-head">
                    <div className="tl-title">{r.reminderTitle || '手动回访'}</div>
                    <div className="tl-date">{r.date}</div>
                  </div>
                  <div className="tl-body">
                    {r.parentFeedback && <p><span className="k">家长反馈</span><span className="v">{r.parentFeedback}</span></p>}
                    {r.childProblems && <p><span className="k">遇到困难</span><span className="v problem">{r.childProblems}</span></p>}
                    {r.childProgress && <p><span className="k">取得进步</span><span className="v progress">{r.childProgress}</span></p>}
                    {r.teacherAdvice && <p><span className="k">老师建议</span><span className="v advice">{r.teacherAdvice}</span></p>}
                    {r.nextPlan && <p><span className="k">下期计划</span><span className="v">{r.nextPlan}</span></p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <StudentForm s={s} onClose={() => setShowForm(false)} onSave={async (data) => {
          await api.updateStudent(s.id, data);
          refreshData();
          setShowForm(false);
        }} />
      )}

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
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div className="tt">编辑学员</div>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="form-group">
          <label className="form-label">姓名 <span className="req">*</span></label>
          <input className="form-input" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">家长手机号</label>
          <input className="form-input" value={form.parentPhone || ''} onChange={e => setForm(f => ({ ...f, parentPhone: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">家长微信</label>
          <input className="form-input" value={form.parentWechat || ''} onChange={e => setForm(f => ({ ...f, parentWechat: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">性别</label>
          <div className="chips">
            {GENDERS.map(g => (
              <span key={g} className={`chip ${form.gender === g ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, gender: g }))}>{g}</span>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">出生年月</label>
          <input className="form-input" type="date" value={form.birthDate || ''} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">年级</label>
          <input className="form-input" value={form.grade || ''} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">英语基础</label>
          <div className="chips">
            {ENGLISH_LEVELS.map(l => (
              <span key={l} className={`chip ${form.englishLevel === l ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, englishLevel: l }))}>{l}</span>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">激活日期</label>
          <input className="form-input" type="date" value={form.activateDate || ''} onChange={e => setForm(f => ({ ...f, activateDate: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">备注</label>
          <textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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

function RecordForm({ record, reminderTitle, form, onChange, onSave, onDelete, onClose }) {
  const isEdit = !!record;
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div className="tt">{isEdit ? '编辑回访' : '新增回访'}</div>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        {reminderTitle && <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>{reminderTitle}</div>}
        <div className="form-group">
          <label className="form-label">回访日期</label>
          <input className="form-input" type="date" value={form.date || ''} onChange={e => onChange(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">家长反馈</label>
          <textarea className="form-textarea" placeholder="家长对课程/服务的反馈" value={form.parentFeedback || ''} onChange={e => onChange(f => ({ ...f, parentFeedback: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">孩子遇到的问题</label>
          <textarea className="form-textarea" placeholder="学习中遇到的困难" value={form.childProblems || ''} onChange={e => onChange(f => ({ ...f, childProblems: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">孩子进步表现</label>
          <textarea className="form-textarea" placeholder="值得肯定的进步点" value={form.childProgress || ''} onChange={e => onChange(f => ({ ...f, childProgress: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">老师反馈建议</label>
          <textarea className="form-textarea" placeholder="给家长和孩子的建议" value={form.teacherAdvice || ''} onChange={e => onChange(f => ({ ...f, teacherAdvice: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">下一阶段计划</label>
          <textarea className="form-textarea" placeholder="下阶段学习安排" value={form.nextPlan || ''} onChange={e => onChange(f => ({ ...f, nextPlan: e.target.value }))} />
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
