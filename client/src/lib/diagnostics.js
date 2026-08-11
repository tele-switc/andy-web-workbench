// 连接诊断器 — 区分前端"主机离线"的真实原因
// 状态机：
//   internet_offline  互联网不可达（本机断网）
//   host_unreachable  浏览器有网，但主机 API 不可达（可能是 Tailscale/Funnel/Node 关闭，或网络屏蔽）
//   host_down         （可选细分）通过 /api/diag 得知主机侧各环节状态
//   api_ok_ws_down    API 在线，但 WebSocket 断开（实时降级为轮询）
//   syncing           正在同步
//   all_ok            全部正常
import * as api from '../api';

export const DIAG_STATES = {
  internet_offline: { key: 'internet_offline', label: '本机网络断开', friendly: '当前网络不可用，操作会暂存本机，联网后自动同步。' },
  host_unreachable: { key: 'host_unreachable', label: '主机不可达', friendly: '未能连接到工作台主机。可能是电脑关机/休眠、Tailscale 未运行、或当前网络屏蔽了连接。' },
  host_down: { key: 'host_down', label: '主机未运行', friendly: '主机服务未运行，正在尝试自动恢复。' },
  api_ok_ws_down: { key: 'api_ok_ws_down', label: '在线（实时降级）', friendly: '已连接主机，实时推送暂不可用，已切换为轮询刷新。' },
  syncing: { key: 'syncing', label: '同步中', friendly: '正在与主机同步…' },
  all_ok: { key: 'all_ok', label: '已同步', friendly: '' },
};

// 探测互联网（不受主机影响）
async function probeInternet() {
  if (navigator.onLine === false) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    clearTimeout(t);
    // 某些网络禁止 no-cors；用 /api/health 兜底判断
    return await api.checkHostHealth();
  }
}

// 获取主机侧详细诊断（当主机可达时）
export async function fetchHostDiag() {
  try {
    const res = await api.getDiag();
    return res;
  } catch {
    return null;
  }
}

// 计算当前简化状态
export function deriveState(netOnline, hostOnline, wsConnected, syncing) {
  if (syncing) return DIAG_STATES.syncing;
  if (!netOnline) return DIAG_STATES.internet_offline;
  if (!hostOnline) return DIAG_STATES.host_unreachable;
  if (!wsConnected) return DIAG_STATES.api_ok_ws_down;
  return DIAG_STATES.all_ok;
}

// 运行完整诊断，返回结构化结果（供"系统状态"页展示）
export async function runDiagnostics() {
  const internetOk = await probeInternet();
  const hostApiOk = await api.checkHostHealth();
  const diag = hostApiOk ? await fetchHostDiag() : null;
  // 通过 health 的 publicUrl 判断 host 是否可达
  return {
    internet: { ok: internetOk, label: internetOk ? '正常' : '不可达' },
    hostApi: { ok: hostApiOk, label: hostApiOk ? '可达' : '不可达' },
    hostDiag: diag,
    ws: { connected: api.getWsConnected() },
    derived: deriveState(internetOk, hostApiOk, api.getWsConnected(), false),
    checkedAt: Date.now(),
  };
}