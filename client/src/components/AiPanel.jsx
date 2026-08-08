import React, { useState, useEffect, useRef } from 'react';
import * as api from '../api';

const AI_STATUS_LABELS = {
  ok: { text: 'AI 已连接', color: 'var(--success)' },
  invalid_key: { text: 'AI Key 无效', color: 'var(--danger)' },
  not_configured: { text: 'AI 未配置', color: 'var(--text-tertiary)' },
  unreachable: { text: 'AI 服务不可达', color: 'var(--warning)' },
  error: { text: 'AI 服务错误', color: 'var(--warning)' },
  unknown: { text: 'AI 状态检测中', color: 'var(--text-tertiary)' },
};

export default function AiPanel({ onClose, data }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sugLoading, setSugLoading] = useState(true);
  const [chatMode, setChatMode] = useState(false);
  const [aiStatus, setAiStatus] = useState({ status: 'unknown', detail: '' });
  const messagesEnd = useRef(null);

  // Check AI connectivity
  useEffect(() => {
    let cancelled = false;
    api.getAiStatus().then(s => {
      if (!cancelled) setAiStatus(s);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load initial suggestions
  useEffect(() => {
    let cancelled = false;
    setSugLoading(true);
    api.getAiSuggestions().then(result => {
      if (!cancelled) {
        setSuggestions(result.suggestions || []);
        // Add welcome message
        if (result.aiInsights) {
          const insights = Array.isArray(result.aiInsights) ? result.aiInsights : [result.aiInsights];
          setMessages([{
            role: 'bot',
            text: `你好！我是小K，你的AI助理。当前共有 ${data.students.length} 位学员，${data.leads.length} 位意向家长。有什么需要帮忙的吗？`,
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          }]);
        } else {
          setMessages([{
            role: 'bot',
            text: `你好！我是小K 🤖 我可以帮你：
• 分析学员数据，给出跟进建议
• 规划教学安排
• 提醒待办事项
• 回答你的问题

当前共 ${data.students.length} 位学员，${data.leads.length} 位意向，${data.records.length} 条回访记录。`,
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          }]);
        }
      }
    }).catch(() => {
      setMessages([{
        role: 'bot',
        text: `你好！我是小K 🤖 当前共 ${data.students.length} 位学员，${data.leads.length} 位意向家长。有什么需要帮忙的吗？`,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }]);
    }).finally(() => {
      if (!cancelled) setSugLoading(false);
    });
    return () => { cancelled = true; };
  }, [data.students.length, data.leads.length, data.records.length]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setChatMode(true);

    setMessages(prev => [...prev, {
      role: 'user',
      text,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }]);

    setLoading(true);
    try {
      const result = await api.aiChat(text);
      setMessages(prev => [...prev, {
        role: 'bot',
        text: result.reply,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        local: result.local
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: '抱歉，我暂时无法回答，请稍后再试。',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = async (sug) => {
    setChatMode(true);
    setMessages(prev => [...prev, {
      role: 'user',
      text: `帮我处理：${sug.title}`,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }]);

    setLoading(true);
    try {
      const result = await api.aiChat(`关于"${sug.title}": ${sug.content}，请给我具体建议。`);
      setMessages(prev => [...prev, {
        role: 'bot',
        text: result.reply,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }]);
      // Mark suggestion as read
      if (sug.id) {
        api.updateSuggestion(sug.id, 'read').catch(() => {});
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: sug.content,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="tt">
          <span className="dot" style={{ background: (AI_STATUS_LABELS[aiStatus.status] || AI_STATUS_LABELS.unknown).color }} />
          小K · AI 助手
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: (AI_STATUS_LABELS[aiStatus.status] || AI_STATUS_LABELS.unknown).color }}>
            {(AI_STATUS_LABELS[aiStatus.status] || AI_STATUS_LABELS.unknown).text}
          </span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Suggestions (when not in chat mode) */}
      {!chatMode && !sugLoading && suggestions.length > 0 && (
        <div className="ai-suggestions" style={{ borderBottom: '1px solid var(--border)', padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 500 }}>
            AI 智能建议
          </div>
          {suggestions.map((sug, i) => (
            <div key={sug.id || i} className="ai-sug" onClick={() => handleSuggestionClick(sug)}>
              <div className="t">
                <span style={{ color: sug.type === 'follow_up' ? 'var(--primary)' : sug.type === 'lead_reminder' ? 'var(--warning)' : 'var(--info)' }}>
                  {sug.type === 'follow_up' ? '📋' : sug.type === 'lead_reminder' ? '✉' : '💡'}
                </span>
                {sug.title}
              </div>
              <div className="c">{sug.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ${msg.role}`}>
            {msg.text}
            <span className="time">{msg.time}{msg.local ? ' · 本地模式' : ''}</span>
          </div>
        ))}
        {loading && (
          <div className="ai-msg bot">
            <div className="typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="ai-input-bar">
        <textarea
          className="ai-input"
          placeholder="问问小K... (Enter 发送)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button className="ai-send" onClick={handleSend} disabled={loading || !input.trim()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}