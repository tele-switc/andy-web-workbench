import React, { useState } from 'react';

// AI Core — 视觉化的 AI 状态指示器（粒子 orb）
// 状态: idle | analyzing | discovered | question | learning | listening
const STATE_CONFIG = {
  idle: { label: '待命', ringOpacity: 0.15 },
  analyzing: { label: '分析中', ringOpacity: 0.45 },
  discovered: { label: '发现规律', ringOpacity: 0.6 },
  question: { label: '有问题想确认', ringOpacity: 0.55 },
  learning: { label: '学习完成', ringOpacity: 0.6 },
  listening: { label: '等待中', ringOpacity: 0.3 },
};

export default function AiCore({ state = 'idle', onClick, suggestion }) {
  const [active, setActive] = useState(false);
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.idle;

  const handleClick = () => {
    setActive(!active);
    onClick?.();
  };

  return (
    <button
      className={`ai-core ${state === 'idle' ? '' : 'awake'} ${state}`}
      onClick={handleClick}
      aria-label="AI 核心"
      role="button"
    >
      {/* 外围粒子环 */}
      <div className="ai-ring">
        <span style={{ opacity: cfg.ringOpacity }} />
      </div>
      {/* 核心圆点 */}
      <div className="ai-dot" />
      {/* 状态光环（仅在非 idle 时显示） */}
      {state !== 'idle' && (
        <div className="ai-aura" />
      )}
      {/* 悬停时显示标签 */}
      <div className="ai-core-tooltip">
        <span className="ai-core-label">{cfg.label}</span>
        {suggestion && <span className="ai-core-suggestion">{suggestion.slice(0, 40)}…</span>}
      </div>
    </button>
  );
}

export function AiCoreDrawer({ open, onClose, recentQuestions, hypotheses, status, onOpenChat }) {
  if (!open) return null;
  return (
    <div className="ai-drawer" onClick={onClose}>
      <div className="ai-drawer-card" onClick={e => e.stopPropagation()}>
        <div className="ai-drawer-head">
          <span>💡 小K · AI 认知</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>

        {onOpenChat && (
          <button className="btn primary full" style={{ marginBottom: 14 }} onClick={onOpenChat}>
            打开 AI 助手对话
          </button>
        )}

        {hypotheses?.length > 0 && (
          <div className="ai-drawer-sec">
            <div className="sec-label">它最近学到的</div>
            {hypotheses.slice(0, 3).map(h => (
              <div key={h.id} className="ai-drawer-fact">
                <div className="fact-dot" />
                <div>
                  <div className="fact-title">{h.title}</div>
                  <div className="fact-text">{h.statement}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {recentQuestions?.length > 0 && (
          <div className="ai-drawer-sec">
            <div className="sec-label">它想问你的</div>
            {recentQuestions.slice(0, 2).map(q => (
              <div key={q.id} className="ai-drawer-que">
                <div className="que-icon">？</div>
                <div className="que-text">{q.question}</div>
                {q.reason && <div className="que-reason">{q.reason}</div>}
              </div>
            ))}
          </div>
        )}

        {status && (
          <div className="ai-drawer-sec stats">
            <div>观察 {status.observations || 0}</div>
            <div>推测 {status.hypotheses || 0}</div>
            <div>已确认 {status.principles || 0}</div>
          </div>
        )}
      </div>
    </div>
  );
}