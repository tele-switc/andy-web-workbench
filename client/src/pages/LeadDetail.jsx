import React, { useState } from 'react';
import * as api from '../api';
import { LEAD_STATUSES, LEAD_MILESTONES, leadStatusTone, addDays, todayStr } from '../lib/reminders';

export default function LeadDetail({ data, navigate, params, refreshData }) {
  const l = data.leads.find(x => x.id === params.id);
  const [showForm, setShowForm] = useState(false);
  const [converting, setConverting] = useState(false);
  const [form, setForm] = useState({});

  if (!l) {
    navigate('leads');
    return null;
  }

  const today = todayStr();
  const done = l.remindersDone || [];
  const tone = leadStatusTone(l.followStatus);
  const converted = (l.followStatus || '') === '已转正式';

  const handleDelete = async () => {
    if (!window.confirm('确定删除这位家长的信息？')) return;
    try {
      await api.deleteLead(l.id);
      refreshData();
      navigate('leads');
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleConvert = async () => {
    if (!window.confirm('将按意向信息创建学员档案（激活日期为今天），确定转化？')) return;
    try {
      setConverting(true);
      await api.convertLead(l.id);
      refreshData();
      navigate('leadDetail', { id: l.id });
    } catch (err) {
      alert('转化失败: ' + err.message);
    } finally {
      setConverting(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.updateLead(l.id, form);
      refreshData();
      setShowForm(false);
      setForm({});
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  };

  return (
    <div>
      <div className="back-bar">
        <button className="back" onClick={() => navigate('leads')} aria-label="返回">‹</button>
        <div className="tt">意向学员</div>
        <button className="act" onClick={() => { setForm({ ...l }); setShowForm(true); }}>编辑</button>
      </div>

      <div className="profile-card">
        <div className="profile-top">
          <div className={`avatar lg ${converted ? '' : 'amber'}`}>{l.wechatNickname.charAt(0)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">
              {l.wechatNickname}
              <span className={`tag ${tone}`}>{l.followStatus || '新咨询'}</span>
              {converted && <span className="tag sage">已转为正式学员</span>}
            </div>
            <div className="profile-sub">咨询于 {l.consultDate || '—'}{l.source ? ' · ' + l.source : ''}</div>
          </div>
          {!converted && <button className="btn danger sm" onClick={handleDelete}>删除</button>}
        </div>

        <div className="stat-grid">
          <div className="stat-cell"><div className="v">{l.childAge || '—'}</div><div className="k">孩子年龄</div></div>
          <div className="stat-cell"><div className="v">{l.childGrade || '—'}</div><div className="k">孩子年级</div></div>
          <div className="stat-cell"><div className="v">{l.englishLevel || '—'}</div><div className="k">英语基础</div></div>
        </div>

        {(l.concerns || []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {l.concerns.map(c => <span key={c} className="tag soft">{c}</span>)}
          </div>
        )}
        {l.notes && <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 12 }}>{l.notes}</div>}
      </div>

      {/* 跟进节点时间轴 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">跟进节点</span>
          <span className="card-sub">按咨询日期自动计算</span>
        </div>
        {!l.consultDate ? (
          <div className="empty" style={{ padding: '14px 0' }}>填写咨询日期后自动生成跟进节点</div>
        ) : (
          <div className="timeline" style={{ paddingTop: 2 }}>
            {LEAD_MILESTONES.map(m => {
              const isDone = done.includes(m.key);
              const due = addDays(l.consultDate, m.days);
              const state = isDone
                ? { cls: 'done', text: `${m.title} · 已完成` }
                : due < today
                  ? { cls: 'rose', text: `${m.title} · ${due} · 待跟进` }
                  : { cls: '', text: `${m.title} · ${due}` };
              return (
                <div key={m.key} className={`tl-node ${state.cls}`}>
                  <div className="tl-card">
                    <div className="tl-head">
                      <div className="tl-title">{m.title}</div>
                      <div className="tl-date">{due}</div>
                    </div>
                    <div className="tl-body">
                      <p><span className="k">状态</span><span className="v">{isDone ? '已完成 ✓' : due < today ? '待跟进' : '未到期'}</span></p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {converted ? (
        <div className="stage-box center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>已转为正式学员</span>
        </div>
      ) : (
        <button className="btn primary full" onClick={handleConvert} disabled={converting}>
          {converting ? '转化中...' : '转为正式学员'}
        </button>
      )}

      {showForm && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="sheet">
            <div className="sheet-grip" />
            <div className="sheet-head">
              <div className="tt">编辑意向学员</div>
              <button className="sheet-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">家长微信昵称</label>
              <input className="form-input" value={form.wechatNickname || ''} onChange={e => setForm(f => ({ ...f, wechatNickname: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">咨询日期</label>
              <input className="form-input" type="date" value={form.consultDate || ''} onChange={e => setForm(f => ({ ...f, consultDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">孩子年龄</label>
              <input className="form-input" value={form.childAge || ''} onChange={e => setForm(f => ({ ...f, childAge: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">孩子年级</label>
              <input className="form-input" value={form.childGrade || ''} onChange={e => setForm(f => ({ ...f, childGrade: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">咨询来源</label>
              <input className="form-input" value={form.source || ''} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">跟进状态</label>
              <div className="chips">
                {LEAD_STATUSES.map(s => (
                  <span key={s} className={`chip ${form.followStatus === s ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, followStatus: s }))}>{s}</span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">备注</label>
              <textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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
