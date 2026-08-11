import React, { useState, useEffect } from 'react';
import * as api from '../api';
import AnimatedNumber from '../components/AnimatedNumber';
import { calcAllDue, calcStudentDueCount, calcLeadDueCount, todayStr, fmtMD } from '../lib/reminders';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function Home({ data, navigate, status, loading }) {
  const { students, leads, records } = data;
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const today = todayStr();

  const dueAll = calcAllDue(students, leads, today);
  const overdue = dueAll.filter(r => r.overdue);
  const dueToday = dueAll.filter(r => !r.overdue);

  // 重点关注学员：有逾期回访的正式学员
  const focusStudents = students
    .map(s => ({ s, due: calcStudentDueCount(s, today) }))
    .filter(x => x.due > 0)
    .sort((a, b) => b.due - a.due);

  // 意向跟进：需要跟进的意向学员
  const leadFollow = leads
    .map(l => ({ l, due: calcLeadDueCount(l, today) }))
    .filter(x => x.due > 0)
    .sort((a, b) => b.due - a.due);

  // 最近成长记录
  const recentRecords = [...records]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 4);
  const studentName = (id) => students.find(s => s.id === id)?.name || '';

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    api.getAiSuggestions().then(result => {
      if (!cancelled) setAiSuggestions((result.suggestions || []).slice(0, 3));
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoadingSuggestions(false);
    });
    return () => { cancelled = true; };
  }, []);

  const goDetail = (r) => navigate(r.isStudent ? 'studentDetail' : 'leadDetail', { id: r.ownerId });

  return (
    <div>
      {/* 动态欢迎层 */}
      <div className="greeting-card">
        <div className="greeting-date">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</div>
        <div className="greeting-main-txt">{greeting()}，今天要回访 <AnimatedNumber target={dueAll.length} className="anim-number" /> 人</div>
        <div className="sub" style={{ marginTop: 4, color: 'var(--text-2)', fontSize: 13 }}>
          {overdue.length > 0 ? `有 ${overdue.length} 项已逾期，记得优先处理` : '今天也没有遗漏，继续保持'}
        </div>
        <div className="greeting-ai-status">
          <div className="ai-center" data-state={status}>
            <div className="ai-orb" />
            <div className="ai-core-center" />
          </div>
          <span className="greeting-ai-label">
            {status === 'connected' || status === 'all_ok'
              ? '小K 正在观察：需要关注 ' + focusStudents.length + ' 位学员，' + leadFollow.length + ' 位家长待跟进'
              : status === 'syncing' ? '正在同步…'
              : status === 'host_unreachable' ? '主机暂不可达，已进入离线模式'
              : '小K 在线观察中'}
          </span>
        </div>
      </div>

      {/* 今日概览 */}
      <div className="overview">
        <div className="overview-item"><div className="num sage"><AnimatedNumber target={dueToday.length} /></div><div className="lab">今日待办</div></div>
        <div className="overview-item"><div className="num rose"><AnimatedNumber target={overdue.length} /></div><div className="lab">已逾期</div></div>
        <div className="overview-item"><div className="num slate"><AnimatedNumber target={students.length} /></div><div className="lab">正式学员</div></div>
        <div className="overview-item"><div className="num slate"><AnimatedNumber target={leads.length} /></div><div className="lab">意向学员</div></div>
      </div>

      {/* AI 建议 */}
      {!loadingSuggestions && aiSuggestions.length > 0 && (
        <div className="ai-tip" onClick={() => navigate('more')} style={{ cursor: 'pointer' }}>
          <svg className="spark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
          </svg>
          <div>
            <div className="t">{aiSuggestions[0].title}</div>
            <div className="c">{aiSuggestions[0].content}</div>
          </div>
        </div>
      )}

      {/* 今日待办 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">今日待办</span>
          <span className="card-sub">{dueAll.length} 项</span>
          <span className="card-link" onClick={() => navigate('reminders')}>全部 ›</span>
        </div>
        {dueAll.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0 12px' }}>
            <div className="big">✓</div>
            <div>今天没有待办提醒</div>
          </div>
        ) : (
          <div>
            {dueAll.slice(0, 5).map(r => (
              <div key={r.key + r.ownerId} className="todo-item" onClick={() => goDetail(r)} style={{ cursor: 'pointer' }}>
                <span className={`todo-dot ${r.overdue ? 'rose' : 'amber'}`} />
                <div className="todo-main">
                  <div className="todo-title">
                    {r.title}
                    <span className={`tag ${r.overdue ? 'rose' : 'amber'}`}>
                      {r.overdue ? `逾期 ${Math.round((new Date(today) - new Date(r.dueDate)) / 86400000)} 天` : '今天'}
                    </span>
                  </div>
                  <div className="todo-who">
                    {r.ownerName} · {fmtMD(r.dueDate)} · {r.isStudent ? '学员回访' : '意向跟进'}
                  </div>
                </div>
                <span style={{ color: 'var(--text-3)', fontSize: 13 }}>›</span>
              </div>
            ))}
            {dueAll.length > 5 && (
              <div className="center" style={{ padding: '10px 0 2px', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer' }}
                onClick={() => navigate('reminders')}>
                还有 {dueAll.length - 5} 项，查看全部 ›
              </div>
            )}
          </div>
        )}
      </div>

      {/* 重点关注学员 */}
      {focusStudents.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">需要关注的学员</span>
            <span className="card-link" onClick={() => navigate('students')}>全部学员 ›</span>
          </div>
          {focusStudents.slice(0, 3).map(({ s, due }) => (
            <div key={s.id} className="todo-item" onClick={() => navigate('studentDetail', { id: s.id })} style={{ cursor: 'pointer' }}>
              <span className={`todo-dot rose`} />
              <div className="todo-main">
                <div className="todo-title">{s.name}<span className="tag rose">{due} 项回访待做</span></div>
                <div className="todo-who">{s.grade || '未填年级'} · 激活 {fmtMD(s.activateDate)}</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: 13 }}>›</span>
            </div>
          ))}
        </div>
      )}

      {/* 意向跟进 */}
      {leadFollow.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">意向家长跟进</span>
            <span className="card-link" onClick={() => navigate('leads')}>全部意向 ›</span>
          </div>
          {leadFollow.slice(0, 3).map(({ l, due }) => (
            <div key={l.id} className="todo-item" onClick={() => navigate('leadDetail', { id: l.id })} style={{ cursor: 'pointer' }}>
              <span className={`todo-dot amber`} />
              <div className="todo-main">
                <div className="todo-title">{l.wechatNickname}<span className="tag amber">{due} 次待跟进</span></div>
                <div className="todo-who">咨询于 {fmtMD(l.consultDate)}{l.childGrade ? ' · ' + l.childGrade : ''}</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: 13 }}>›</span>
            </div>
          ))}
        </div>
      )}

      {/* 最近成长记录 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">最近成长记录</span>
          <span className="card-sub">{records.length} 条</span>
          <span className="card-link" onClick={() => navigate('archives')}>档案 ›</span>
        </div>
        {recentRecords.length === 0 ? (
          <div className="empty" style={{ padding: '18px 0 10px' }}>
            <div className="big">📓</div>
            <div>还没有回访记录，完成第一次回访吧</div>
          </div>
        ) : (
          recentRecords.map(r => {
            const name = studentName(r.studentId) || r.studentName || '';
            const snippet = r.childProgress || r.parentFeedback || r.teacherAdvice || r.childProblems || '';
            return (
              <div key={r.id} className="todo-item" onClick={() => navigate('studentDetail', { id: r.studentId })} style={{ cursor: 'pointer' }}>
                <div className="avatar sm">{name.charAt(0) || '?'}</div>
                <div className="todo-main">
                  <div className="todo-title">{r.reminderTitle || '手动回访'}<span className="tag soft">{fmtMD(r.date)}</span></div>
                  <div className="todo-who" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {name} · {snippet || '（无摘要）'}
                  </div>
                </div>
                <span style={{ color: 'var(--text-3)', fontSize: 13 }}>›</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
