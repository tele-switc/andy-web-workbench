import React, { useState, useEffect } from 'react';
import * as api from '../api';
import { runDiagnostics, DIAG_STATES, deriveState } from '../lib/diagnostics';

export default function More({ data, navigate, onOpenAi }) {
  const [showApiUrl, setShowApiUrl] = useState(false);
  const [apiUrl, setApiUrl] = useState(api.getApiBase());
  const [diag, setDiag] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);

  const runDiag = async () => {
    setDiagRunning(true);
    const result = await runDiagnostics();
    setDiag(result);
    setDiagRunning(false);
  };

  useEffect(() => { runDiag(); }, []);

  const handleLogout = () => {
    if (window.confirm('确定退出登录？')) {
      api.setToken('');
      window.location.reload();
    }
  };

  const handleSaveApiUrl = () => {
    api.setApiBaseUrl(apiUrl);
    setShowApiUrl(false);
    window.location.reload();
  };

  const items = [
    { icon: '📁', label: '成长档案', desc: '查看所有学员的回访记录', action: () => navigate('archives') },
    { icon: '🧠', label: 'AI 学到了什么', desc: '查看 AI 对规划方法的学习与推测', action: () => navigate('analystLearned') },
    { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 5.5L20 9l-5.5 1.5L12 16l-2.5-5.5L4 9l5.5-1.5L12 2z"/><path d="M19 14l1 2.2 2.2 1-2.2 1L19 20.4l-1-2.2-2.2-1 2.2-1L19 14z"/></svg>,
      label: 'AI 助手', desc: '数据分析、跟进建议、智能问答', action: onOpenAi },
    { icon: '🔗', label: 'API 地址', desc: `当前: ${api.getApiBase() || '使用默认'}`, action: () => { setShowApiUrl(true); setApiUrl(api.getApiBase()); } },
    { icon: '🚪', label: '退出登录', desc: '', action: handleLogout },
  ];

  const Label = ({ ok, yes = '正常', no = '异常' }) => (
    <span className={`tag ${ok ? 'primary' : 'rose'}`} style={{ fontWeight: 500 }}>{ok ? yes : no}</span>
  );

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>更多</div>

      <div className="more-list">
        {items.map((item, i) => (
          <button key={i} className="more-item" onClick={item.action}>
            <span className="mi-icon">{typeof item.icon === 'string' ? <span style={{ fontSize: 18 }}>{item.icon}</span> : item.icon}</span>
            <div className="mi-body">
              <div className="mi-t">{item.label}</div>
              {item.desc && <div className="mi-d">{item.desc}</div>}
            </div>
            <span className="mi-arrow">›</span>
          </button>
        ))}
      </div>

      {/* 系统状态 */}
      <div className="section-title">系统状态 <span className="card-link" style={{ marginLeft: 8, cursor: 'pointer', fontSize: 12, fontWeight: 400 }} onClick={diagRunning ? null : runDiag}>{diagRunning ? '诊断中…' : '刷新'}</span></div>
      <div className="more-list">
        <div className="more-item" style={{ cursor: 'default' }}>
          <span className="mi-icon" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>
          </span>
          <div className="mi-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="mi-t">连接状态</div>
            <div className="mi-d" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              <span>互联网 <Label ok={diag ? diag.internet.ok : navigator.onLine !== false} /></span>
              <span>主机 API <Label ok={diag ? diag.hostApi.ok : api.getHostOnline()} /></span>
              <span>WebSocket <Label ok={diag ? diag.ws.connected : api.getWsConnected()} /></span>
            </div>
            {diag && diag.hostDiag && (
              <div className="mi-d" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                <span>Node <Label ok={diag.hostDiag.node.up} /></span>
                <span>Tailscale <Label ok={diag.hostDiag.tailscale.online} /></span>
                <span>Funnel <Label ok={diag.hostDiag.funnel.on} /></span>
                <span>SQLite <Label ok={diag.hostDiag.sqlite.up} /></span>
              </div>
            )}
            <div className="mi-d" style={{ marginTop: 2, fontSize: 11 }}>
              {diag ? diag.derived.friendly : '等待诊断…'}
            </div>
          </div>
        </div>
      </div>

      <div className="version-foot">
        <div>Andy 工作台 v2.1</div>
        <div style={{ marginTop: 2 }}>数据存储在本地 SQLite · 通过 Tailscale Funnel 公网访问</div>
      </div>

      {showApiUrl && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowApiUrl(false); }}>
          <div className="sheet">
            <div className="sheet-grip" />
            <div className="sheet-head">
              <div className="tt">API 地址设置</div>
              <button className="sheet-close" onClick={() => setShowApiUrl(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">API 服务器地址</label>
              <input className="form-input" value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                placeholder="https://your-server.com" />
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
                留空 = 使用自动检测的地址。目前固定公网地址为 https://tech-taylor.taila3ecd9.ts.net
              </div>
            </div>
            <div className="sheet-actions">
              <button className="btn neutral" onClick={() => setShowApiUrl(false)}>取消</button>
              <button className="btn primary" onClick={handleSaveApiUrl}>保存并刷新</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}