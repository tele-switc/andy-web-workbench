import React, { useState } from 'react';
import * as api from '../api';

const ENGLISH_LEVELS = ['零基础', '启蒙阶段', '有英语学习基础'];
const CONCERNS = ['价格', '效果', '孩子兴趣', '时间安排', '已有学习工具', '家庭规划'];
const FOLLOW_STATUSES = ['新咨询', '已沟通', '考虑中', '待决定', '已成交', '暂缓'];

export default function Leads({ data, navigate, refreshData }) {
  const [keyword, setKeyword] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});

  const list = keyword.trim()
    ? data.leads.filter(l =>
        l.wechatNickname.indexOf(keyword) >= 0 || (l.childGrade || '').indexOf(keyword) >= 0 || (l.source || '').indexOf(keyword) >= 0)
    : [...data.leads].sort((a, b) => ((a.consultDate || '') < (b.consultDate || '') ? 1 : -1));

  const today = new Date().toISOString().slice(0, 10);
  const LEAD_MILESTONES = [
    { key: 'f1', days: 1 }, { key: 'f7', days: 7 }, { key: 'f30', days: 30 }, { key: 'f180', days: 180 }
  ];

  const calcDue = (l) => {
    const done = l.remindersDone || [];
    let count = 0;
    LEAD_MILESTONES.forEach(m => {
      if (done.includes(m.key)) return;
      if (!l.consultDate) return;
      const d = new Date(l.consultDate);
      d.setDate(d.getDate() + m.days);
      if (d.toISOString().slice(0, 10) <= today) count++;
    });
    return count;
  };

  const statusColor = (s) => {
    const map = { '新咨询': '#635BFF', '已沟通': '#14B8A6', '考虑中': '#D97706', '待决定': '#8B5CF6', '已成交': '#16A34A', '暂缓': '#9E9EA8' };
    return map[s] || '#9E9EA8';
  };

  const handleSave = async () => {
    if (!form.wechatNickname) { alert('请填写家长微信昵称'); return; }
    try {
      if (form._edit) {
        await api.updateLead(form._edit, form);
      } else {
        await api.createLead(form);
      }
      setShowForm(false);
      setForm({});
      refreshData();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  };

  const openForm = (lead) => {
    setForm(lead ? { ...lead, _edit: lead.id } : { consultDate: today, followStatus: '新咨询', concerns: [] });
    setShowForm(true);
  };

  const toggleConcern = (c) => {
    setForm(f => {
      const arr = f.concerns || [];
      return { ...f, concerns: arr.includes(c) ? arr.filter(x => x !== c) : [...arr, c] };
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em' }}>意向学员</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            共 {data.leads.length} 位咨询家长
          </div>
        </div>
      </div>

      <div className="search-wrap">
        <span className="icon">🔍</span>
        <input className="search" placeholder="搜索微信昵称 / 年级 / 来源"
          value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <div className="big">🗂</div>
          <div>{data.leads.length === 0 ? '还没有意向学员' : '没有匹配的家长'}</div>
        </div>
      ) : (
        <div className="list">
          {list.map(l => {
            const n = calcDue(l);
            const sc = statusColor(l.followStatus);
            return (
              <div key={l.id} className="item-row" onClick={() => navigate('leadDetail', { id: l.id })}>
                <div className="avatar">{l.wechatNickname.charAt(0)}</div>
                <div className="item-body">
                  <div className="item-name">
                    {l.wechatNickname}
                    <span className="tag" style={{ background: sc + '1A', color: sc }}>{l.followStatus}</span>
                  </div>
                  <div className="item-meta">咨询 {l.consultDate || '—'}{l.source ? ' · ' + l.source : ''}</div>
                </div>
                {n > 0 && <div className="badge">{n}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button className="btn primary full" onClick={() => openForm(null)}>
          ＋ 新增意向学员
        </button>
      </div>

      {showForm && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setShowForm(false); }}>
          <div className="sheet">
            <div className="sheet-head">
              <div className="tt">{form._edit ? '编辑意向学员' : '新增意向学员'}</div>
              <button className="sheet-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">家长微信昵称 <span className="req">*</span></label>
              <input className="form-input" placeholder="家长微信昵称" value={form.wechatNickname || ''}
                onChange={e => setForm(f => ({ ...f, wechatNickname: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">咨询日期</label>
              <input className="form-input" type="date" value={form.consultDate || ''}
                onChange={e => setForm(f => ({ ...f, consultDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">孩子年龄</label>
              <input className="form-input" placeholder="如：8岁" value={form.childAge || ''}
                onChange={e => setForm(f => ({ ...f, childAge: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">孩子年级</label>
              <input className="form-input" placeholder="如：二年级" value={form.childGrade || ''}
                onChange={e => setForm(f => ({ ...f, childGrade: e.target.value }))} />
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
              <label className="form-label">咨询来源</label>
              <input className="form-input" placeholder="如：朋友圈、转介绍、短视频" value={form.source || ''}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">家长关注点</label>
              <div className="chips" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CONCERNS.map(c => (
                  <span key={c} className={`chip ${(form.concerns || []).includes(c) ? 'selected' : ''}`}
                    onClick={() => toggleConcern(c)}>{c}</span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">跟进状态</label>
              <div className="chips" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {FOLLOW_STATUSES.map(s => (
                  <span key={s} className={`chip ${form.followStatus === s ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, followStatus: s }))}>{s}</span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">备注</label>
              <textarea className="form-textarea" placeholder="咨询过程中的其他信息" value={form.notes || ''}
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