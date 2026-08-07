import React, { useState } from 'react';
import * as api from '../api';

const LEAD_MILESTONES = [
  { key: 'f1', days: 1, title: '第一次跟进' },
  { key: 'f7', days: 7, title: '第二次跟进' },
  { key: 'f30', days: 30, title: '长期维护' },
  { key: 'f180', days: 180, title: '重新唤醒' },
];

export default function LeadDetail({ data, navigate, params, refreshData }) {
  const l = data.leads.find(x => x.id === params.id);
  const [showForm, setShowForm] = useState(false);
  const [converting, setConverting] = useState(false);

  if (!l) {
    navigate('leads');
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const done = l.remindersDone || [];
  const sc = {
    '新咨询': '#635BFF', '已沟通': '#14B8A6', '考虑中': '#D97706',
    '待决定': '#8B5CF6', '已成交': '#16A34A', '暂缓': '#9E9EA8'
  }[l.followStatus] || '#9E9EA8';

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

  return (
    <div>
      <div className="back-bar">
        <button className="back" onClick={() => navigate('leads')}>‹</button>
        <div className="tt">意向学员详情</div>
        <button className="act" onClick={() => setShowForm(true)}>编辑</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar lg">{l.wechatNickname.charAt(0)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {l.wechatNickname}
              <span className="tag" style={{ background: sc + '1A', color: sc, marginLeft: 8 }}>{l.followStatus}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              咨询日期：{l.consultDate || '—'}
            </div>
          </div>
          <button className="btn danger sm" onClick={handleDelete}>删除</button>
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', textAlign: 'center', padding: '6px 0' }}>
          <div className="stat"><div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{l.childAge || '—'}</div><div className="lab">孩子年龄</div></div>
          <div className="stat"><div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{l.childGrade || '—'}</div><div className="lab">孩子年级</div></div>
          <div className="stat"><div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{l.englishLevel || '—'}</div><div className="lab">英语基础</div></div>
          <div className="stat"><div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{l.source || '—'}</div><div className="lab">咨询来源</div></div>
        </div>
        {(l.concerns || []).length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
            {l.concerns.map(c => (
              <span key={c} className="tag primary">{c}</span>
            ))}
          </div>
        )}
        {l.notes && <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0' }}>{l.notes}</div>}
      </div>

      <div className="card">
        <div className="card-title-row">
          <span className="card-title">跟进节点</span>
          <span className="card-link">按咨询日期自动计算</span>
        </div>
        {LEAD_MILESTONES.map(m => {
          const due = (() => {
            if (done.includes(m.key)) return { done: true, text: '已完成', color: 'var(--success)' };
            if (!l.consultDate) return { done: false, text: '无咨询日期', color: 'var(--text-tertiary)' };
            const d = new Date(l.consultDate);
            d.setDate(d.getDate() + m.days);
            const ds = d.toISOString().slice(0, 10);
            if (ds < today) return { done: false, text: '咨询后' + m.days + '天 · ' + ds + '（待跟进）', color: 'var(--danger)' };
            return { done: false, text: '咨询后' + m.days + '天 · ' + ds, color: 'var(--text-tertiary)' };
          })();
          return (
            <div key={m.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0' }}>
              <div className="tl-dot" style={{
                background: due.done ? '#ECFDF3' : due.color === 'var(--danger)' ? '#FEF2F2' : '#F1F1F3',
                color: due.done ? 'var(--success)' : due.color === 'var(--danger)' ? 'var(--danger)' : 'var(--text-tertiary)'
              }}>{due.done ? '✓' : '·'}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{due.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      {l.followStatus === '已成交' ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--success)', fontSize: 13 }}>
          ✓ 已成交，该家长已转为正式学员
        </div>
      ) : (
        <button className="btn primary full" onClick={handleConvert} disabled={converting}>
          {converting ? '转化中...' : '转为正式学员'}
        </button>
      )}
    </div>
  );
}