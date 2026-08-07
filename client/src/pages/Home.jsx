import React, { useState, useEffect } from 'react';
import * as api from '../api';

const ENTRY_ICONS = {
  leads: { icon: '✉', color: '#14B8A6', label: '意向学员', desc: '咨询未成交' },
  students: { icon: '👥', color: '#635BFF', label: '正式学员', desc: '在读学员管理' },
  archives: { icon: '📁', color: '#8B5CF6', label: '成长档案', desc: '记录成长轨迹' },
  reminders: { icon: '⏰', color: '#D97706', label: '回访提醒', desc: '自动到期提醒' },
};

function monthDay(dateStr) {
  if (!dateStr) return '';
  const p = dateStr.split('-');
  return (+p[1]) + '月' + (+p[2]) + '日';
}

export default function Home({ data, navigate }) {
  const { students, leads, records } = data;
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Calculate due reminders
  const dueAll = [];
  const today = new Date().toISOString().slice(0, 10);

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

  function addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  students.forEach(s => {
    const done = s.remindersDone || [];
    STUDENT_MILESTONES.forEach(m => {
      if (done.includes(m.key)) return;
      if (!s.activateDate) return;
      const due = addDays(s.activateDate, m.days);
      if (due <= today) {
        dueAll.push({ ownerId: s.id, ownerName: s.name, key: m.key, title: m.title, dueDate: due, overdue: due < today, isStudent: true });
      }
    });
  });
  leads.forEach(l => {
    const done = l.remindersDone || [];
    LEAD_MILESTONES.forEach(m => {
      if (done.includes(m.key)) return;
      if (!l.consultDate) return;
      const due = addDays(l.consultDate, m.days);
      if (due <= today) {
        dueAll.push({ ownerId: l.id, ownerName: l.wechatNickname, key: m.key, title: m.title, dueDate: due, overdue: due < today, isStudent: false });
      }
    });
  });

  const overdue = dueAll.filter(r => r.overdue);
  const dueToday = dueAll.filter(r => !r.overdue);

  // Load AI suggestions
  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    api.getAiSuggestions().then(result => {
      if (!cancelled) {
        const all = result.suggestions || [];
        setAiSuggestions(all.slice(0, 3));
      }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoadingSuggestions(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {/* Stats */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="stats">
          <div className="stat">
            <div className="num" style={{ color: 'var(--primary)' }}>{students.length}</div>
            <div className="lab">正式学员</div>
          </div>
          <div className="stat">
            <div className="num" style={{ color: '#14B8A6' }}>{leads.length}</div>
            <div className="lab">意向学员</div>
          </div>
          <div className="stat">
            <div className="num" style={{ color: 'var(--danger)' }}>{dueAll.length}</div>
            <div className="lab">待办提醒</div>
          </div>
          <div className="stat">
            <div className="num" style={{ color: '#8B5CF6' }}>{records.length}</div>
            <div className="lab">回访记录</div>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      {aiSuggestions.length > 0 && (
        <div className="insight-card">
          <div className="head">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7.05 7.05 0 0113 22h-2a7.05 7.05 0 01-6.73-4H3a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/>
            </svg>
            AI 建议
          </div>
          <div className="body">
            {aiSuggestions.map((s, i) => (
              <div key={i} style={{ marginBottom: i < aiSuggestions.length - 1 ? 8 : 0 }}>
                <strong>{s.title}</strong>: {s.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Entries */}
      <div className="entry-grid" style={{ marginBottom: 16 }}>
        {Object.entries(ENTRY_ICONS).map(([key, e]) => (
          <div key={key} className="entry" onClick={() => navigate(key === 'archives' ? 'archives' : key)}>
            <div className="icon-wrap" style={{ background: e.color + '18', color: e.color }}>
              {e.icon}
            </div>
            <div className="t">{e.label}</div>
            <div className="d">{e.desc}</div>
          </div>
        ))}
      </div>

      {/* Today's Reminders */}
      <div className="card">
        <div className="card-title-row">
          <span className="card-title">今日提醒</span>
          <span className="card-link" onClick={() => navigate('reminders')}>查看全部 ›</span>
        </div>
        {dueAll.length === 0 ? (
          <div className="empty" style={{ padding: '18px 0' }}>
            <div className="big">✅</div>
            <div>今天没有待办提醒，继续保持</div>
          </div>
        ) : (
          <div>
            {overdue.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8, fontWeight: 500 }}>
                已逾期 {overdue.length} 项
              </div>
            )}
            {overdue.slice(0, 3).map(r => (
              <ReminderRow key={r.key + r.ownerId} r={r} />
            ))}
            {dueToday.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--primary)', marginBottom: 8, fontWeight: 500, marginTop: 8 }}>
                今日到期
              </div>
            )}
            {dueToday.slice(0, 3).map(r => (
              <ReminderRow key={r.key + r.ownerId} r={r} />
            ))}
            {dueAll.length > 3 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, cursor: 'pointer' }}
                onClick={() => navigate('reminders')}>
                还有 {dueAll.length - 3} 项待办 ›
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReminderRow({ r }) {
  return (
    <div className="rem-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="avatar sm" style={{ width: 36, height: 36, fontSize: 14 }}>
        {r.ownerName ? r.ownerName.charAt(0) : '?'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.title}
          <span className={`tag ${r.overdue ? 'danger' : 'primary'}`}>
            {r.overdue ? '逾期' + Math.round((new Date() - new Date(r.dueDate)) / 86400000) + '天' : '今日'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {r.ownerName} · {r.dueDate}
        </div>
      </div>
    </div>
  );
}