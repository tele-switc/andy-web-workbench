import React, { useState, useEffect } from 'react';
import * as api from '../api';
import { todayStr, fmtMD } from '../lib/reminders';

export default function Reminders({ data, navigate, refreshData }) {
  const [tab, setTab] = useState(0); // 0=student, 1=lead
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = todayStr();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getReminders().then(list => {
      if (!cancelled) setReminders(list);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = reminders.filter(r => tab === 0 ? r.isStudent : !r.isStudent);
  const overdue = filtered.filter(r => r.overdue);
  const todayItems = filtered.filter(r => !r.overdue);

  const handleDone = async (r) => {
    try {
      await api.markReminderDone(r.ownerId, r.key, r.isStudent);
      setReminders(prev => prev.filter(x => !(x.ownerId === r.ownerId && x.key === r.key)));
      refreshData();
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  };

  const goRecord = (r) => {
    if (r.isStudent) navigate('studentDetail', { id: r.ownerId });
    else navigate('leadDetail', { id: r.ownerId });
  };

  const renderRem = (r) => {
    return (
      <div key={r.key + r.ownerId} className="row" style={{ cursor: 'pointer' }} onClick={() => goRecord(r)}>
        <div className={`avatar sm ${r.overdue ? 'rose' : 'amber'}`}>{r.ownerName ? r.ownerName.charAt(0) : '?'}</div>
        <div className="row-body">
          <div className="row-title">
            {r.title}
            <span className={`tag ${r.overdue ? 'rose' : 'amber'}`}>
              {r.overdue ? `逾期 ${Math.round((new Date(today) - new Date(r.dueDate)) / 86400000)} 天` : '今天'}
            </span>
          </div>
          <div className="row-meta">{r.ownerName} · {fmtMD(r.dueDate)}</div>
        </div>
        <button className="btn neutral sm" onClick={(e) => { e.stopPropagation(); handleDone(r); }}>完成</button>
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>回访提醒</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>按激活 / 咨询日期自动计算</div>
      </div>

      <div className="seg">
        <button className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>学员回访 ({reminders.filter(r => r.isStudent).length})</button>
        <button className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>意向跟进 ({reminders.filter(r => !r.isStudent).length})</button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /><div>加载中...</div></div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="big">✓</div>
          <div>{tab === 0 ? '暂无到期的学员回访提醒' : '暂无到期的意向跟进提醒'}</div>
        </div>
      ) : (
        <div>
          {overdue.length > 0 && (
            <>
              <div className="section-title">已逾期 · {overdue.length}</div>
              <div className="list" style={{ marginBottom: 12 }}>{overdue.map(renderRem)}</div>
            </>
          )}
          {todayItems.length > 0 && (
            <>
              <div className="section-title">今日到期 · {todayItems.length}</div>
              <div className="list">{todayItems.map(renderRem)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}