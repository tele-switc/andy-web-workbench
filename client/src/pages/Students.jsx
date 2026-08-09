import React, { useState } from 'react';
import * as api from '../api';
import { calcStudentDueCount, todayStr } from '../lib/reminders';

const GENDERS = ['男', '女'];
const ENGLISH_LEVELS = ['零基础', '启蒙阶段', '有英语学习基础'];

export default function Students({ data, navigate, refreshData }) {
  const [keyword, setKeyword] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const today = todayStr();

  const list = keyword.trim()
    ? data.students.filter(s =>
        s.name.indexOf(keyword) >= 0 || (s.parentWechat || '').indexOf(keyword) >= 0 || (s.parentPhone || '').indexOf(keyword) >= 0)
    : data.students;

  const handleSave = async () => {
    if (!form.name || !form.activateDate) {
      alert('请填写姓名和激活日期');
      return;
    }
    try {
      if (form._edit) await api.updateStudent(form._edit, form);
      else await api.createStudent(form);
      setShowForm(false);
      setForm({});
      refreshData();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  };

  const openForm = (stu) => {
    setForm(stu ? { ...stu, _edit: stu.id } : { activateDate: today });
    setShowForm(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>正式学员</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>共 {data.students.length} 位在读学员</div>
        </div>
      </div>

      <div className="search-wrap">
        <span className="icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </span>
        <input className="search" placeholder="搜索姓名 / 家长微信 / 手机号"
          value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <div className="big">🗂</div>
          <div>{data.students.length === 0 ? '还没有正式学员' : '没有匹配的学员'}</div>
        </div>
      ) : (
        <div className="list">
          {list.map(s => {
            const n = calcStudentDueCount(s, today);
            return (
              <div key={s.id} className="row tappable" onClick={() => navigate('studentDetail', { id: s.id })}>
                <div className="avatar">{s.name.charAt(0)}</div>
                <div className="row-body">
                  <div className="row-title">
                    {s.name}
                    {s.gender && <span className="tag soft">{s.gender}</span>}
                    {n > 0 && <span className="tag rose">{n} 项待回访</span>}
                  </div>
                  <div className="row-meta">{s.grade || '未填年级'} · 激活 {s.activateDate || '—'}</div>
                </div>
                <span style={{ color: 'var(--text-3)', fontSize: 15 }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button className="btn primary full" onClick={() => openForm(null)}>＋ 新增学员</button>
      </div>

      {showForm && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="sheet">
            <div className="sheet-grip" />
            <div className="sheet-head">
              <div className="tt">{form._edit ? '编辑学员' : '新增学员'}</div>
              <button className="sheet-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">姓名 <span className="req">*</span></label>
              <input className="form-input" placeholder="孩子姓名" value={form.name || ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">家长手机号</label>
              <input className="form-input" placeholder="用于联系家长" value={form.parentPhone || ''}
                onChange={e => setForm(f => ({ ...f, parentPhone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">家长微信</label>
              <input className="form-input" placeholder="家长微信号" value={form.parentWechat || ''}
                onChange={e => setForm(f => ({ ...f, parentWechat: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">性别</label>
              <div className="chips">
                {GENDERS.map(g => (
                  <span key={g} className={`chip ${form.gender === g ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, gender: g }))}>{g}</span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">出生年月</label>
              <input className="form-input" type="date" value={form.birthDate || ''}
                onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">年级</label>
              <input className="form-input" placeholder="如：三年级" value={form.grade || ''}
                onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">英语基础</label>
              <div className="chips">
                {ENGLISH_LEVELS.map(l => (
                  <span key={l} className={`chip ${form.englishLevel === l ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, englishLevel: l }))}>{l}</span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">激活日期 <span className="req">*</span></label>
              <input className="form-input" type="date" value={form.activateDate || ''}
                onChange={e => setForm(f => ({ ...f, activateDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">备注</label>
              <textarea className="form-textarea" placeholder="其他需要记录的信息" value={form.notes || ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="sheet-actions">
              <button className="btn neutral" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
