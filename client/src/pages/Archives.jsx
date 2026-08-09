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
        <button className="back" onClick={() => navigate('home')} aria-label="返回">‹</button>
        <div className="tt">成长档案</div>
        <span className="muted" style={{ fontSize: 12, paddingRight: 6 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {g.s.name}
                <span className="tag sage">{g.recs.length} 次回访</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>{g.s.grade || '未填年级'}</div>
            </div>
            <button className="btn ghost sm" onClick={() => navigate('studentDetail', { id: g.s.id })}>档案 ›</button>
          </div>
          <div className="divider" />
          <div className="timeline" style={{ paddingTop: 2 }}>
            {g.recs.map(r => (
              <div key={r.id} className="tl-node done">
                <div className="tl-card" onClick={() => navigate('studentDetail', { id: g.s.id })} style={{ cursor: 'pointer' }}>
                  <div className="tl-head">
                    <div className="tl-title">{r.reminderTitle || '手动回访'}</div>
                    <div className="tl-date">{r.date}</div>
                  </div>
                  <div className="tl-body">
                    {r.childProgress ?
                      <p><span className="k">进步</span><span className="v progress">{r.childProgress.slice(0, 46)}</span></p>
                      : r.parentFeedback ?
                        <p><span className="k">反馈</span><span className="v">{r.parentFeedback.slice(0, 46)}</span></p>
                        : null}
                    {r.childProblems && <p><span className="k">困难</span><span className="v problem">{r.childProblems.slice(0, 46)}</span></p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}