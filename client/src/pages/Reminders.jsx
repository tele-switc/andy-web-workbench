import React, { useState, useEffect } from 'react';
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

const LEAD_MILESTONES = [
  { key: 'f1', days: 1, title: '第一次跟进' },
  { key: 'f7', days: 7, title: '第二次跟进' },
  { key: 'f30', days: 30, title: '长期维护' },
  { key: 'f180', days: 180, title: '重新唤醒' },
];

export default function Reminders({ data, navigate, refreshData }) {
  const [tab, setTab] = useState(0); // 0=student, 1=lead
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

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

  const filtered = tab === 0
    ? reminders.filter(r => r.isStudent)
    : reminders.filter(r => !r.isStudent);

  const handleDone = async (r) => {
    try {
      await api.markReminderDone(r.ownerId, r.key, r.isStudent);
      setReminders(prev => prev.filter(x => !(x.ownerId === r.ownerId && x.key === r.key)));
      refreshData();
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  };

  const handleRecord = (r) => {
    const s = data.students.find(x => x.id === r.ownerId);
    if (s) navigate('studentDetail', { id: s.id });
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em' }}>回访提醒</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
          共 {reminders.length} 条待办 · 按激活/咨询日期自动计算
        </div>
      </div>

      <div className="seg">
        <button className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>学员回访 ({reminders.filter(r => r.isStudent).length})</button>
        <button className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>意向跟进 ({reminders.filter(r => !r.isStudent).length})</button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /><div>加载中...</div></div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="big">⏰</div>
          <div>{tab === 0 ? '暂无到期的学员回访提醒' : '暂无到期的意向跟进提醒'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => {
            const overdue = r.dueDate < today;
            const daysOverdue = Math.round((new Date(today) - new Date(r.dueDate)) / 86400000);
            return (
              <div key={r.key + r.ownerId} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar sm">{r.ownerName ? r.ownerName.charAt(0) : '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.title}
                      <span className={`tag ${overdue ? 'danger' : 'primary'}`}>
                        {overdue ? '逾期' + daysOverdue + '天' : '今日'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {r.ownerName} · {r.dueDate}
                    </div>
                  </div>
                  <button className="btn neutral sm" onClick={() => handleDone(r)}>完成</button>
                  {r.isStudent && (
                    <button className="btn primary sm" onClick={() => handleRecord(r)}>去记录</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}