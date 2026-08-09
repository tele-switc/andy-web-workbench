import React, { useState } from 'react';
import * as api from '../api';
import { LEAD_STATUSES, leadStatusTone, calcLeadReminders, todayStr, fmtMD } from '../lib/reminders';

const ENGLISH_LEVELS = ['零基础', '启蒙阶段', '有英语学习基础'];
const CONCERNS = ['价格', '效果', '孩子兴趣', '时间安排', '已有学习工具', '家庭规划'];

export default function Leads({ data, navigate, refreshData }) {
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState('全部');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const today = todayStr();

  const statusCounts = {};
  data.leads.forEach(l => {
    statusCounts[l.followStatus || '新咨询'] = (statusCounts[l.followStatus || '新咨询'] || 0) + 1;
  });

  const list = data.leads
    .filter(l => filter === '全部' || (l.followStatus || '新咨询') === filter)
    .filter(l => keyword.trim()
      ? l.wechatNickname.indexOf(keyword) >= 0 || (l.childGrade || '').indexOf(keyword) >= 0 || (l.source || '').indexOf(keyword) >= 0
      : true)
    .map(l => {
      const rems = calcLeadReminders(l, today);
      const overdue = rems.filter(r => r.overdue).length;
      const next = rems[rems.length - 1]; // sorted: 最近到期在前（overdue 优先），取最后一条 = 最近一个节点
      const nextRem = rems.length > 0 ? rems[rems.length - 1] : null;
      return { l, overdue, nextRem };
    })
    .sort((a, b) => {
      // 逾期优先，其次看下次跟进日期
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const da = a.nextRem ? a.nextRem.dueDate : '9999';
      const db = b.nextRem ? b.nextRem.dueDate : '9999';
      if (da !== db) return da < db ? -1 : 1;
      return (b.l.consultDate || '') < (a.l.consultDate || '') ? -1 : 1;
    });

  const handleSave = async () => {
    if (!form.wechatNickname) { alert('请填写家长微信昵称'); return; }
    try {
      if (form._edit) await api.updateLead(form._edit, form);
      else await api.createLead(form);
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
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>意向学员</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>共 {data.leads.length} 位咨询家长</div>
        </div>
      </div>

      <div className="status-tabs">
        <button className={`status-tab ${filter === '全部' ? 'active' : ''}`} onClick={() => setFilter('全部')}>
          全部<span className="cnt">{data.leads.length}</span>
        </button>
        {LEAD_STATUSES.map(st => (
          <button key={st} className={`status-tab ${filter === st ? 'active' : ''}`} onClick={() => setFilter(st)}>
            {st}<span className="cnt">{statusCounts[st] || 0}</span>
          </button>
        ))}
      </div>

      <div className="search-wrap">
        <span className="icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </span>
        <input className="search" placeholder="搜索微信昵称 / 年级 / 来源"
          value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <div className="big">🗂</div>
          <div>{data.leads.length === 0 ? '还没有意向学员' : '这个状态下没有家长'}</div>
        </div>
      ) : (
        <div>
          {list.map(({ l, overdue, nextRem }) => {
            const tone = leadStatusTone(l.followStatus);
            const nextText = !nextRem ? '暂无跟进节点'
              : nextRem.overdue ? `已逾期 ${Math.round((new Date(today) - new Date(nextRem.dueDate)) / 86400000)} 天 · ${nextRem.title}`
              : nextRem.dueDate === today ? `今天 · ${nextRem.title}`
              : `${fmtMD(nextRem.dueDate)} · ${nextRem.title}`;
            const nextTone = !nextRem ? 'sage' : nextRem.overdue ? 'overdue' : nextRem.dueDate === today ? 'today' : '';
            return (
              <div key={l.id} className="lead-card tappable" onClick={() => navigate('leadDetail', { id: l.id })}>
                <div className="lead-head">
                  <div className={`avatar ${overdue > 0 ? 'rose' : 'amber'}`}>{l.wechatNickname.charAt(0)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lead-name">
                      {l.wechatNickname}
                      <span className={`tag ${tone}`}>{l.followStatus || '新咨询'}</span>
                      {overdue > 0 && <span className="tag rose">逾期 {overdue} 项</span>}
                    </div>
                    <div className="lead-meta">
                      <span>咨询 {l.consultDate || '—'}</span>
                      {l.childGrade && <span>{l.childGrade}</span>}
                      {l.source && <span>{l.source}</span>}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-3)', fontSize: 15 }}>›</span>
                </div>
                {(l.concerns || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                    {l.concerns.map(c => <span key={c} className="tag soft">{c}</span>)}
                  </div>
                )}
                <div className="lead-foot">
                  <span className={`lead-next ${nextTone}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                    {nextText}
                  </span>
                  <button className="btn sage sm" onClick={(e) => { e.stopPropagation(); navigate('leadDetail', { id: l.id }); }}>去跟进</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button className="btn primary full" onClick={() => openForm(null)}>＋ 新增意向学员</button>
      </div>

      {showForm && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="sheet">
            <div className="sheet-grip" />
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
              <div className="chips">
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
              <div className="chips">
                {CONCERNS.map(c => (
                  <span key={c} className={`chip ${(form.concerns || []).includes(c) ? 'selected' : ''}`}
                    onClick={() => toggleConcern(c)}>{c}</span>
                ))}
              </div>
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
