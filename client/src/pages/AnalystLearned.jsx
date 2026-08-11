import React, { useState, useEffect } from 'react';
import * as api from '../api';

export default function AnalystLearned({ navigate, studentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reflecting, setReflecting] = useState(false);
  const [answerInput, setAnswerInput] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getAnalystLearned();
      setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAnswer = async (qid) => {
    const text = (answerInput[qid] || '').trim();
    if (!text) return;
    await api.postAnswer(qid, text);
    setAnswerInput(prev => ({ ...prev, [qid]: '' }));
    load();
  };

  const handleSkip = async (qid) => {
    await api.skipQuestion(qid);
    load();
  };

  const handleCorrect = async (id, statement) => {
    const correction = window.prompt('纠正这条记忆：', statement);
    if (!correction) return;
    await api.postCorrect('hypothesis', id, correction);
    load();
  };

  const handleReflect = async () => {
    setReflecting(true);
    await api.postReflect(true);
    setReflecting(false);
    load();
  };

  if (loading) {
    return <div className="loading"><div className="spinner" /><div>加载中...</div></div>;
  }

  const d = data || {};
  const obs = d.observations || [];
  const hyps = (d.hypotheses || []).filter(h => h.status !== 'refuted');
  const principles = d.principles || [];
  const questions = d.questions || [];
  const feedback = d.feedback || [];

  const catLabel = {
    record_created: '记录回访', record_advice: '给出建议', record_progress: '记录进步',
    record_problem: '记录困难', student_updated: '修改学员', view_student: '查看学员',
  };

  return (
    <div>
      <div className="back-bar">
        <button className="back" onClick={() => navigate('more')} aria-label="返回">‹</button>
        <div className="tt">AI 学到了什么</div>
        <button className="act" onClick={handleReflect} disabled={reflecting}>{reflecting ? '分析中…' : '反思'}</button>
      </div>

      {/* 状态概览 */}
      <div className="overview" style={{ marginBottom: 16 }}>
        <div className="overview-item"><div className="num sage">{(d.status||{}).observations ?? 0}</div><div className="lab">观察到</div></div>
        <div className="overview-item"><div className="num slate">{(d.status||{}).hypotheses ?? 0}</div><div className="lab">推测</div></div>
        <div className="overview-item"><div className="num slate">{(d.status||{}).principles ?? 0}</div><div className="lab">已确认</div></div>
        <div className="overview-item"><div className="num amber">{(d.status||{}).pendingQuestions ?? 0}</div><div className="lab">待问</div></div>
      </div>

      {/* 最近观察 */}
      <div className="section-title">最近观察到</div>
      <div className="card">
        {obs.length === 0 ? (
          <div className="empty" style={{ padding: '16px 0' }}>还没有观察记录。你查看、编辑、回访学员时，AI 会悄悄记录分析。</div>
        ) : obs.slice(0, 8).map(o => (
          <div key={o.id} className="todo-item">
            <span className={`todo-dot ${o.category.startsWith('record') ? 'sage' : 'amber'}`} />
            <div className="todo-main">
              <div className="todo-title">{catLabel[o.category] || o.category}<span className="tag soft">{new Date(o.created_at).toLocaleDateString('zh-CN')}</span></div>
              <div className="todo-who">{JSON.stringify(o.detail).slice(0, 60)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* AI 推测的假设 */}
      <div className="section-title">AI 当前推测 <span className="card-sub" style={{ fontWeight: 400 }}>（未确认，仅为规律推断）</span></div>
      {hyps.length === 0 ? (
        <div className="card"><div className="empty" style={{ padding: '16px 0' }}>暂无推测，观察足够后 AI 会自动总结。</div></div>
      ) : hyps.map(h => (
        <div key={h.id} className="card">
          <div className="card-head">
            <span className="card-title">{h.title}</span>
            <span className="tag amber">置信 {Math.round(h.confidence * 100)}%</span>
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 10 }}>{h.statement}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sage sm" onClick={() => handleCorrect(h.id, h.statement)}>纠正</button>
            <button className="btn neutral sm" onClick={async () => { await api.postCorrect('hypothesis', h.id, '已确认'); load(); }}>确认</button>
          </div>
        </div>
      ))}

      {/* 已确认原则 */}
      <div className="section-title">已确认原则</div>
      {principles.length === 0 ? (
        <div className="card"><div className="empty" style={{ padding: '16px 0' }}>回答 AI 的问题后，这里会沉淀你的规划原则。</div></div>
      ) : principles.map(p => (
        <div key={p.id} className="card" style={{ borderColor: 'var(--primary-soft)' }}>
          <div className="card-head">
            <span className="card-title" style={{ color: 'var(--primary-deep)' }}>{p.title}</span>
            <span className="tag primary">已确认</span>
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{p.statement}</div>
        </div>
      ))}

      {/* AI 想问的问题 */}
      <div className="section-title">AI 想问你的问题</div>
      {questions.length === 0 ? (
        <div className="card"><div className="empty" style={{ padding: '16px 0' }}>目前没有待确认的问题。AI 只在真正有价值时提问。</div></div>
      ) : questions.map(q => (
        <div key={q.id} className="card" style={{ borderColor: 'var(--warning-soft)' }}>
          <div className="card-head">
            <span className="card-title">❓ {q.question}</span>
          </div>
          {q.reason && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>原因：{q.reason}</div>}
          <div className="form-group" style={{ marginBottom: 8 }}>
            <textarea className="form-textarea" placeholder="回答（将沉淀为你的规划原则）" rows={2}
              value={answerInput[q.id] || ''} onChange={e => setAnswerInput(prev => ({ ...prev, [q.id]: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary sm" onClick={() => handleAnswer(q.id)}>回答</button>
            <button className="btn neutral sm" onClick={() => handleSkip(q.id)}>跳过</button>
            <button className="btn ghost sm" onClick={() => api.dismissQuestion(q.id).then(load)}>不需学习</button>
          </div>
        </div>
      ))}

      {/* 最近修正 */}
      {feedback.length > 0 && (
        <>
          <div className="section-title">最近被修正的理解</div>
          <div className="card">
            {feedback.map(f => (
              <div key={f.id} className="todo-item">
                <span className="todo-dot rose" />
                <div className="todo-main">
                  <div className="todo-title">已纠正 {f.target_type}</div>
                  <div className="todo-who">{f.correction}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}