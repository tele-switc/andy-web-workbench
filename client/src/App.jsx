import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api';
import * as idb from './db/indexeddb';
import { deriveState, DIAG_STATES } from './lib/diagnostics';

// Pages
import Home from './pages/Home';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Reminders from './pages/Reminders';
import Archives from './pages/Archives';
import More from './pages/More';
import AnalystLearned from './pages/AnalystLearned';
import AiPanel from './components/AiPanel';
import AiCore, { AiCoreDrawer } from './components/AiCore';
import ParticleField from './components/ParticleField';
import Toast from './components/Toast';

const ICONS = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z"/></svg>,
  students: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M5 11v5c0 1.5 3 3 7 3s7-1.5 7-3v-5"/><path d="M21 8v5"/></svg>,
  leads: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 11a4 4 0 11-8 0 4 4 0 018 0z"/><path d="M3 20a6 6 0 0112 0v1H3v-1z"/><path d="M19 6v4M21 8h-4"/></svg>,
  reminders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>,
  more: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>,
};

export default function App() {
  const [view, setView] = useState('home');
  const [params, setParams] = useState({});
  const [toasts, setToasts] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState('connecting');
  const [hostOnline, setHostOnline] = useState(() => api.getHostOnline());
  const [netOnline, setNetOnline] = useState(navigator.onLine !== false);
  const [data, setData] = useState({ students: [], leads: [], records: [] });
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(() => api.isLoggedIn());
  const [showLogin, setShowLogin] = useState(!api.isLoggedIn());
  const [aiCoreOpen, setAiCoreOpen] = useState(false);
  const [analystStatus, setAnalystStatus] = useState(null);
  const [analystQuestions, setAnalystQuestions] = useState([]);
  const [analystHypotheses, setAnalystHypotheses] = useState([]);
  const toastId = useRef(0);

  // Toast handler
  useEffect(() => {
    api.setToastHandler((msg, type) => {
      const id = ++toastId.current;
      setToasts(prev => [...prev, { id, text: msg, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 2600);
    });
  }, []);

  // Network + host online tracking
  useEffect(() => {
    const on = () => setNetOnline(true);
    const off = () => setNetOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [students, leads, records, stats] = await Promise.all([
        api.getStudents(),
        api.getLeads(),
        api.getRecords(),
        api.getReminderStats().catch(() => ({ total: 0 })),
      ]);
      const newData = { students, leads, records };
      setData(newData);
      setReminderCount(stats.total || 0);
      setSyncStatus('connected');
      await idb.saveLocalData(newData);
      await idb.setLastSyncTime(Date.now());
    } catch (err) {
      console.warn('服务器连接失败，使用离线缓存:', err.message);
      setSyncStatus('offline');
      const local = await idb.getLocalData();
      if (local.students.length || local.leads.length || local.records.length) {
        setData(local);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = api.onHostStatus((online) => {
      setHostOnline(online);
      if (online) {
        // 主机恢复：刷新数据 + 处理离线队列
        api.processOfflineQueue().finally(() => loadData());
      }
    });
    return unsub;
  }, [loadData]);

  // Periodic host health check (detect host recovery while phone stays online)
  useEffect(() => {
    const timer = setInterval(() => {
      api.checkHostHealth().then(ok => {
        if (ok) api.processOfflineQueue().catch(() => {});
      });
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  // Auth changes
  useEffect(() => {
    return api.onAuthChange((state) => {
      setLoggedIn(state);
      setShowLogin(!state);
      if (state) loadData();
    });
  }, [loadData]);

  useEffect(() => { loadData(); }, [loadData]);

  // 加载分析师系统数据（AI Core 展示用）
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    Promise.all([api.getAnalystStatus(), api.getAnalystQuestions(), api.getAnalystLearned()])
      .then(([st, qs, learned]) => {
        if (cancelled) return;
        setAnalystStatus(st);
        setAnalystQuestions((qs || []).filter(x => x.status === 'pending'));
        setAnalystHypotheses((learned?.hypotheses || []).filter(h => h.status !== 'refuted').slice(0, 3));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loggedIn]);

  // WebSocket
  useEffect(() => {
    const unsub = api.connectWebSocket({
      onSync: (syncData) => {
        setData(syncData);
        idb.saveLocalData(syncData);
        setSyncStatus('connected');
      },
      onChange: () => loadData(),
      onStatus: (connected) => {
        if (connected) { setSyncStatus('connected'); loadData(); }
      },
    });
    return unsub;
  }, [loadData]);

  const navigate = useCallback((v, p = {}) => {
    setView(v);
    setParams(p);
    window.scrollTo(0, 0);
    // 分析师观察：查看学员/意向详情
    if (p && p.id) {
      if (v === 'studentDetail') api.postObservation('view_student', p.id, {}).catch(() => {});
      if (v === 'leadDetail') api.postObservation('view_lead', p.id, {}).catch(() => {});
    }
  }, []);

  const refreshData = useCallback(async () => {
    setSyncStatus('syncing');
    await loadData();
    setSyncStatus(api.getHostOnline() ? 'connected' : 'offline');
  }, [loadData]);

  // Derived connection status using diagnostic state machine
  const diagState = deriveState(netOnline, hostOnline, api.getWsConnected(), syncStatus === 'syncing');
  const status = diagState.key;
  const statusLabel = diagState.label;
  const statusFriendly = diagState.friendly;

  const tabs = [
    { key: 'home', label: '首页', icon: ICONS.home },
    { key: 'students', label: '学员', icon: ICONS.students },
    { key: 'leads', label: '意向', icon: ICONS.leads },
    { key: 'reminders', label: '提醒', icon: ICONS.reminders },
    { key: 'more', label: '更多', icon: ICONS.more },
  ];

  return (
    <div className="app">
      {showLogin ? (
        <LoginScreen onSuccess={() => { setShowLogin(false); setLoggedIn(true); loadData(); }} />
      ) : (
        <>
          <header className="header">
            <div className="header-inner">
              <div>
                <div className="header-title">Andy 工作台</div>
                <div className="header-sub">
                  {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
                  {' · '}{['日','一','二','三','四','五','六'][new Date().getDay()]}
                </div>
              </div>
              <div className="header-actions">
                <span className={`status-pill ${status}`}>
                  <span className="dot" />
                  {statusLabel}
                </span>
              </div>
            </div>
          </header>

          {(status === 'host_unreachable' || status === 'internet_offline' || status === 'host_down' || status === 'syncing') && (
            <div className={`banner ${status}`}>
              {status === 'host_unreachable' && (
                <>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M16.7 16.7A11 11 0 0012 3a11 11 0 00-6.3 2M12 21a2 2 0 100-4 2 2 0 000 4z"/><path d="M8 11a4 4 0 014-4M4 14a8 8 0 004.5-2.5"/></svg>
                  <span>{statusFriendly}</span>
                </>
              )}
              {status === 'internet_offline' && (
                <>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 015.08-2.56M8.53 16.11a6 6 0 016.95 0M12 20h.01"/><path d="M1 4l22 22"/></svg>
                  <span>{statusFriendly}</span>
                </>
              )}
              {status === 'syncing' && (
                <>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"/></svg>
                  <span>{statusFriendly}</span>
                </>
              )}
            </div>
          )}

          <div className="content">
            {loading && view !== 'home' ? (
              <SkeletonPage />
            ) : view === 'home' ? (
              <Home data={data} navigate={navigate} status={status} loading={loading} />
            ) : view === 'students' ? (
              <Students data={data} navigate={navigate} refreshData={refreshData} />
            ) : view === 'studentDetail' ? (
              <StudentDetail data={data} navigate={navigate} params={params} refreshData={refreshData} />
            ) : view === 'leads' ? (
              <Leads data={data} navigate={navigate} refreshData={refreshData} />
            ) : view === 'leadDetail' ? (
              <LeadDetail data={data} navigate={navigate} params={params} refreshData={refreshData} />
            ) : view === 'reminders' ? (
              <Reminders data={data} navigate={navigate} refreshData={refreshData} />
            ) : view === 'archives' ? (
              <Archives data={data} navigate={navigate} />
            ) : view === 'more' ? (
              <More data={data} navigate={navigate} onOpenAi={() => setAiOpen(true)} />
            ) : view === 'analystLearned' ? (
              <AnalystLearned navigate={navigate} />
            ) : null}
          </div>

          {!['studentDetail', 'leadDetail', 'archives'].includes(view) && (
            <nav className="tabbar">
              <div className="tabbar-inner">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    className={`tab ${view === tab.key ? 'active' : ''}`}
                    onClick={() => navigate(tab.key)}
                    aria-label={tab.label}
                  >
                    <span className="tab-icon">
                      {tab.icon}
                      {tab.key === 'reminders' && reminderCount > 0 && (
                        <span className="badge">{reminderCount > 99 ? '99+' : reminderCount}</span>
                      )}
                    </span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </nav>
          )}

          {view === 'home' && (
            <ParticleField state="idle" interactive={true} density="normal" />
          )}

          {!aiOpen && !aiCoreOpen && (
            <AiCore
              state="idle"
              onClick={() => setAiCoreOpen(true)}
              suggestion="小K · AI 助手"
            />
          )}

          {aiCoreOpen && (
            <AiCoreDrawer
              open={aiCoreOpen}
              onClose={() => setAiCoreOpen(false)}
              recentQuestions={analystQuestions}
              hypotheses={analystHypotheses}
              status={analystStatus}
              onOpenChat={() => { setAiCoreOpen(false); setAiOpen(true); }}
            />
          )}

          {aiOpen && <AiPanel onClose={() => setAiOpen(false)} data={data} />}

          {toasts.length > 0 && <Toast messages={toasts} />}
        </>
      )}
    </div>
  );
}

function SkeletonPage() {
  return (
    <div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </div>
  );
}

// ---- Login Screen ----
function LoginScreen({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.login(username, password);
      onSuccess();
    } catch (err) {
      setError(err.message === 'Failed to fetch' || err.message.includes('network')
        ? '无法连接到主机，请确认电脑已开机'
        : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">A</div>
        <div className="login-title">Andy 工作台</div>
        <div className="login-sub">请登录后继续</div>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">用户名</label>
            <input className="form-input" type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="输入用户名" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">密码</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="输入密码" />
          </div>
          {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>{error}</div>}
          <button className="btn primary full" type="submit" disabled={busy || !username || !password}>
            {busy ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="login-hint">
          <div>默认账号 admin / admin123，请及时在 server/.env 修改</div>
        </div>
      </div>
    </div>
  );
}
