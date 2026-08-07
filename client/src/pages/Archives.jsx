import React from 'react';

export default function Archives({ data, navigate }) {
  const groups = [];
  data.students.forEach(s => {
    const mine = data.records
      .filter(r => r.studentId === s.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (mine.length) groups.push({ s, recs: mine });
  });
  groups.sort((a, b) => (a.recs[0].date < b.recs[0].date ? 1 : -1));

  return (
    <div>
      <div className="back-bar">
        <button className="back" onClick={() => navigate('home')}>‹</button>
        <div className="tt">成长档案</div>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {groups.length ? groups.length + ' 位学员有记录' : ''}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <div className="big">📁</div>
          <div>暂无成长记录，先去完成一次回访吧</div>
        </div>
      ) : groups.map(g => (
        <div key={g.s.id} className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div className="avatar sm">{g.s.name.charAt(0)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                {g.s.name}
                <span className="tag primary">{g.recs.length} 次回访</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{g.s.grade || '未填年级'}</div>
            </div>
            <button className="btn ghost sm" onClick={() => navigate('studentDetail', { id: g.s.id })}>
              档案 ›
            </button>
          </div>
          <div className="divider" />
          {g.recs.map(r => (
            <div key={r.id} className="tl-item">
              <div className="tl-dot" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>✓</div>
              <div className="tl-body">
                <div className="tl-title">{r.reminderTitle || '手动回访'}</div>
                <div className="tl-sub">
                  {r.date}
                  {r.childProgress ? ' · 进步：' + r.childProgress.slice(0, 22) :
                    r.parentFeedback ? ' · 反馈：' + r.parentFeedback.slice(0, 22) : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}