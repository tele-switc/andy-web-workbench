import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api';
import * as idb from './db/indexeddb';

// Pages
import Home from './pages/Home';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Reminders from './pages/Reminders';
import Archives from './pages/Archives';
import AiPanel from './components/AiPanel';
import Toast from './components/Toast';

const ICONS = {
  home: <svg viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  students: <svg viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>,
  leads: <svg viewBox="0 0 24 24"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>,
  reminders: <svg viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>,
};

export default function App() {
  const [view, setView] = useState('home');
  const [params, setParams] = useState({});
  const [toasts, setToasts] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState('connecting'); // connected, offline, syncing
  const [data, setData] = useState({ students: [], leads: [], records: [] });
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(() => api.isLoggedIn());
  const [showLogin, setShowLogin] = useState(!api.isLoggedIn());
  const toastId = useRef(0);

  // Register toast handler
  useEffect(() => {
    api.setToastHandler((msg) => {
      const id = ++toastId.current;
      setToasts(prev => [...prev, { id, msg }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 2000);
    });
  }, []);

  // Listen for auth changes
  useEffect(() => {
    return api.onAuthChange((state) => {
      setLoggedIn(state);
      setShowLogin(!state);
      if (state) loadData();
    });
  }, [loadData]);

  // Load data from server (with IndexedDB fallback)
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [students, leads, records, stats] = await Promise.all([
        api.getStudents(),
        api.getLeads(),
        api.getRecords(),
        api.getReminderStats().catch(() => ({ total: 0 }))
      ]);
      const newData = { students, leads, records };
      setData(newData);
      setReminderCount(stats.total || 0);
      setSyncStatus('connected');
      // Cache to IndexedDB
      await idb.saveLocalData(newData);
      await idb.setLastSyncTime(Date.now());
    } catch (err) {
      console.warn('服务器连接失败，使用离线缓存:', err.message);
      setSyncStatus('offline');
      // Try IndexedDB
      const local = await idb.getLocalData();
      if (local.students.length || local.leads.length || local.records.length) {
        setData(local);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket
  useEffect(() => {
    const unsub = api.connectWebSocket({
      onSync: (data) => {
        setData(data);
        idb.saveLocalData(data);
        setSyncStatus('connected');
      },
      onChange: (msg) => {
        loadData();
      },
      onStatus: (connected) => {
        setSyncStatus(connected ? 'connected' : 'offline');
        if (connected) loadData();
      }
    });
    return unsub;
  }, [loadData]);

  // Navigate
  const navigate = useCallback((v, p = {}) => {
    setView(v);
    setParams(p);
    window.scrollTo(0, 0);
  }, []);

  const refreshData = useCallback(async () => {
    setSyncStatus('syncing');
    await loadData();
  }, [loadData]);

  const tabs = [
    { key: 'home', label: '首页', icon: ICONS.home },
    { key: 'students', label: '学员', icon: ICONS.students },
    { key: 'leads', label: '意向', icon: ICONS.leads },
    { key: 'reminders', label: '提醒', icon: ICONS.reminders },
  ];

  return (
    <div className="app-shell">
      {/* Login Screen */}
      {showLogin ? (
        <LoginScreen onSuccess={() => { setShowLogin(false); setLoggedIn(true); loadData(); }} />
      ) : (
        <>
      {/* Header */}
      {view === 'home' ? (
        <header className={`app-header`}>
          <div className="header-inner">
            <div>
              <div className="header-title">Andy 工作台</div>
              <div className="header-sub">
                {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
                {' · '}{['日','一','二','三','四','五','六'][new Date().getDay()]}
              </div>
            </div>
            <div className="header-actions">
              <span className={`sync-status ${syncStatus}`}>
                <span className="dot" />
                {syncStatus === 'connected' ? '已同步' : syncStatus === 'syncing' ? '同步中' : '离线'}
              </span>
            </div>
          </div>
        </header>
      ) : null}

      {/* Content */}
      <div className="content">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <div>加载中...</div>
          </div>
        ) : view === 'home' ? (
          <Home data={data} navigate={navigate} />
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
        ) : null}
      </div>

      {/* Tabbar */}
      {!['studentDetail', 'leadDetail', 'archives'].includes(view) && (
        <nav className="tabbar">
          <div className="tabbar-inner">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`tab ${view === tab.key ? 'active' : ''}`}
                onClick={() => navigate(tab.key)}
              >
                <div className="tab-icon">
                  {tab.icon}
                  {tab.key === 'reminders' && reminderCount > 0 && (
                    <span className="badge tab-badge">{reminderCount > 99 ? '99+' : reminderCount}</span>
                  )}
                </div>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* AI FAB */}
      {!aiOpen && (
        <button className="ai-fab" onClick={() => setAiOpen(true)}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7.05 7.05 0 0113 22h-2a7.05 7.05 0 01-6.73-4H3a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/>
          </svg>
        </button>
      )}

      {/* AI Panel */}
      {aiOpen && <AiPanel onClose={() => setAiOpen(false)} data={data} />}

      {/* Toasts */}
      {toasts.length > 0 && <Toast messages={toasts.map(t => t.msg)} />}
      </>
      )}
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32, color: '#fff', fontWeight: 700 }}>A</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Andy 工作台</div>
          <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginTop: 4 }}>请登录后继续</div>
        </div>
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
          {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}
          <button className="btn primary full" type="submit" disabled={busy || !username || !password}>
            {busy ? '登录中...' : '登录'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <div>默认账号: admin / admin123</div>
          <div style={{ marginTop: 4 }}>请及时修改密码</div>
        </div>
      </div>
    </div>
  );
}