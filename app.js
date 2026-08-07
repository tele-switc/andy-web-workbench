'use strict';
/* ============================================================
 * Andy英语学习规划师的工作台（Web 版）
 * 所有数据保存在浏览器 localStorage 中，无需联网
 * ============================================================ */

/* ---------------- 存储 ---------------- */
const LS_STUDENTS = 'wb_students';
const LS_LEADS = 'wb_leads';
const LS_RECORDS = 'wb_records';

let students = loadList(LS_STUDENTS);
let leads = loadList(LS_LEADS);
let records = loadList(LS_RECORDS);

function loadList(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : [];
  } catch (e) {
    return [];
  }
}

function saveAll() {
  localStorage.setItem(LS_STUDENTS, JSON.stringify(students));
  localStorage.setItem(LS_LEADS, JSON.stringify(leads));
  localStorage.setItem(LS_RECORDS, JSON.stringify(records));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------------- 常量 ---------------- */
const ENGLISH_LEVELS = ['零基础', '启蒙阶段', '有英语学习基础'];
const GENDERS = ['男', '女'];
const CONCERNS = ['价格', '效果', '孩子兴趣', '时间安排', '已有学习工具', '家庭规划'];
const FOLLOW_STATUSES = ['新咨询', '已沟通', '考虑中', '待决定', '已成交', '暂缓'];

/* 正式学员回访节点（按激活日期） */
const STUDENT_MILESTONES = [
  { key: 'd7', days: 7, title: '首次学习回访' },
  { key: 'd30', days: 30, title: '一个月学习反馈' },
  { key: 'd90', days: 90, title: '三个月成长回访' },
  { key: 'd180', days: 180, title: '半年阶段复盘' },
  { key: 'd365', days: 365, title: '年度成长反馈' },
  { key: 'd730', days: 730, title: '两年学习复盘' },
  { key: 'd1095', days: 1095, title: '三年成长总结' }
];

/* 意向学员跟进节点（按咨询日期） */
const LEAD_MILESTONES = [
  { key: 'f1', days: 1, title: '第一次跟进' },
  { key: 'f7', days: 7, title: '第二次跟进' },
  { key: 'f30', days: 30, title: '长期维护' },
  { key: 'f180', days: 180, title: '重新唤醒' }
];

/* ---------------- 日期工具 ---------------- */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtYmd(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function today() { return fmtYmd(new Date()); }

function parseYmd(s) {
  const p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function addDays(dateStr, n) {
  const d = parseYmd(dateStr);
  d.setDate(d.getDate() + n);
  return fmtYmd(d);
}

function diffDays(from, to) {
  return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86400000);
}

function monthDay(dateStr) {
  const p = String(dateStr).split('-');
  return p.length < 3 ? dateStr : (+p[1]) + '月' + (+p[2]) + '日';
}

function weekdayLabel() {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
}

/* ---------------- 提醒计算 ---------------- */
function studentDueReminders(s) {
  const t = today();
  const res = [];
  const done = s.remindersDone || [];
  for (const m of STUDENT_MILESTONES) {
    if (done.indexOf(m.key) >= 0) continue;
    if (!s.activateDate) continue;
    const due = addDays(s.activateDate, m.days);
    if (due <= t) {
      res.push({ ownerId: s.id, ownerName: s.name, key: m.key, title: m.title, dueDate: due, days: m.days, overdue: due < t, isStudent: true });
    }
  }
  return res;
}

function leadDueReminders(l) {
  const t = today();
  const res = [];
  const done = l.remindersDone || [];
  for (const m of LEAD_MILESTONES) {
    if (done.indexOf(m.key) >= 0) continue;
    if (!l.consultDate) continue;
    const due = addDays(l.consultDate, m.days);
    if (due <= t) {
      res.push({ ownerId: l.id, ownerName: l.wechatNickname, key: m.key, title: m.title, dueDate: due, days: m.days, overdue: due < t, isStudent: false });
    }
  }
  return res;
}

function nextStudentMilestone(s) {
  const t = today();
  const done = s.remindersDone || [];
  for (const m of STUDENT_MILESTONES) {
    if (done.indexOf(m.key) >= 0) continue;
    if (!s.activateDate) continue;
    if (addDays(s.activateDate, m.days) >= t) return m;
  }
  return null;
}

function nextLeadMilestone(l) {
  const t = today();
  const done = l.remindersDone || [];
  for (const m of LEAD_MILESTONES) {
    if (done.indexOf(m.key) >= 0) continue;
    if (!l.consultDate) continue;
    if (addDays(l.consultDate, m.days) >= t) return m;
  }
  return null;
}

function milestoneDue(s, m) {
  if ((s.remindersDone || []).indexOf(m.key) >= 0) return '';
  return addDays(s.activateDate, m.days);
}

function leadMilestoneDue(l, m) {
  if ((l.remindersDone || []).indexOf(m.key) >= 0) return '';
  return addDays(l.consultDate, m.days);
}

/* ---------------- 状态与视图 ---------------- */
const state = {
  view: 'home',
  studentId: null,
  leadId: null,
  sKeyword: '',
  lKeyword: '',
  rTab: 0
};

const app = document.getElementById('app');

function setView(v) {
  state.view = v;
  state.studentId = null;
  state.leadId = null;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const tabs = document.querySelectorAll('#tabbar .tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.view === state.view));
  switch (state.view) {
    case 'students': renderStudents(); break;
    case 'leads': renderLeads(); break;
    case 'reminders': renderReminders(); break;
    case 'studentDetail': renderStudentDetail(); break;
    case 'leadDetail': renderLeadDetail(); break;
    case 'archives': renderArchives(); break;
    default: renderHome(); break;
  }
}

document.getElementById('tabbar').addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (tab) setView(tab.dataset.view);
});

/* ---------------- 通用 UI ---------------- */
function toast(msg) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 1400);
  setTimeout(() => el.remove(), 1750);
}

function confirmBox(title, msg, onOk, okText, okDanger) {
  const root = document.getElementById('modal-root');
  root.innerHTML =
    '<div class="overlay" style="align-items:center">' +
    '  <div class="dialog">' +
    '    <div class="tt">' + esc(title) + '</div>' +
    '    <div class="msg">' + esc(msg) + '</div>' +
    '    <div class="btns">' +
    '      <button class="cancel" data-act="cancel">取消</button>' +
    '      <button class="ok' + (okDanger ? ' danger' : '') + '" data-act="ok">' + esc(okText || '确定') + '</button>' +
    '    </div>' +
    '  </div>' +
    '</div>';
  root.querySelector('.overlay').addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act;
    if (act === 'ok') { root.innerHTML = ''; onOk(); }
    else if (act === 'cancel' || e.target.classList.contains('overlay')) { root.innerHTML = ''; }
  });
}

function openSheet(html, title) {
  const root = document.getElementById('modal-root');
  root.innerHTML =
    '<div class="overlay">' +
    '  <div class="sheet">' +
    '    <div class="sheet-head"><div class="tt">' + esc(title || '') + '</div>' +
    '      <button class="x" data-act="close">✕</button></div>' +
    html +
    '  </div>' +
    '</div>';
  root.querySelector('.overlay').addEventListener('click', e => {
    if (e.target.classList.contains('overlay') || (e.target.dataset && e.target.dataset.act === 'close')) {
      root.innerHTML = '';
    }
  });
  return root.querySelector('.sheet');
}

function closeSheet() {
  document.getElementById('modal-root').innerHTML = '';
}

function chipsHtml(options, selectedArr) {
  return options.map(o =>
    '<button type="button" class="c' + (selectedArr.indexOf(o) >= 0 ? ' on' : '') + '" data-v="' + esc(o) + '">' + esc(o) + '</button>'
  ).join('');
}

function bindChips(sheet) {
  sheet.querySelectorAll('.chips .c').forEach(c => {
    c.addEventListener('click', () => {
      c.classList.toggle('on');
    });
  });
}

function chipsValues(sheet) {
  const out = [];
  sheet.querySelectorAll('.chips .c.on').forEach(c => out.push(c.dataset.v));
  return out;
}

function chipValue(sheet) {
  const c = sheet.querySelector('.chips .c.on');
  return c ? c.dataset.v : '';
}

function pageHead(title, sub) {
  return '<div class="page-head"><div class="page-title">' + esc(title) + '</div>' +
    (sub ? '<div class="page-sub">' + esc(sub) + '</div>' : '') + '</div>';
}

function backBar(title, rightHtml) {
  return '<div class="back-bar">' +
    '<button class="back" data-act="back">‹</button>' +
    '<div class="tt">' + esc(title) + '</div>' + (rightHtml || '') +
    '</div>';
}

function emptyHtml(big, text) {
  return '<div class="empty"><div class="big">' + esc(big) + '</div>' + esc(text) + '</div>';
}

function avatarHtml(name, size) {
  const first = name ? name.trim().charAt(0) : '?';
  return '<div class="avatar" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.38) + 'px">' + esc(first) + '</div>';
}

function statusColor(status) {
  const map = {
    '新咨询': '#4C6FFF', '已沟通': '#14B8A6', '考虑中': '#F59E0B',
    '待决定': '#8B5CF6', '已成交': '#22C55E', '暂缓': '#94A3B8'
  };
  return map[status] || '#8A8F9E';
}

/* ================= 首页 ================= */
function renderHome() {
  const t = today();
  const dueAll = [];
  students.forEach(s => dueAll.push.apply(dueAll, studentDueReminders(s)));
  leads.forEach(l => dueAll.push.apply(dueAll, leadDueReminders(l)));
  const dueToday = dueAll.filter(r => !r.overdue);
  const overdue = dueAll.filter(r => r.overdue);

  let remHtml;
  if (dueAll.length === 0) {
    remHtml = '<div class="empty" style="padding:18px 0"><div class="big">✅</div>今天没有待办提醒，继续保持</div>';
  } else {
    remHtml = '';
    if (overdue.length) {
      remHtml += '<div class="card-title" style="margin-bottom:2px"><span style="font-size:12px;color:var(--danger)">已逾期</span></div>';
      overdue.forEach(r => { remHtml += remRowHtml(r); });
    }
    if (dueToday.length) {
      remHtml += '<div class="card-title" style="margin-bottom:2px"><span style="font-size:12px;color:var(--primary)">今日到期</span></div>';
      dueToday.forEach(r => { remHtml += remRowHtml(r); });
    }
  }

  app.innerHTML =
    '<div class="page-head">' +
    '  <div class="page-title">Andy英语学习规划师</div>' +
    '  <div class="page-sub">' + monthDay(t) + ' 星期' + weekdayLabel() + ' · 用心记录 专业伴学</div>' +
    '</div>' +

    '<div class="card"><div class="stats">' +
    '  <div class="stat"><div class="num" style="color:var(--primary)">' + students.length + '</div><div class="lab">正式学员</div></div>' +
    '  <div class="stat"><div class="num" style="color:#14B8A6">' + leads.length + '</div><div class="lab">意向学员</div></div>' +
    '  <div class="stat"><div class="num" style="color:var(--danger)">' + dueAll.length + '</div><div class="lab">待办提醒</div></div>' +
    '</div></div>' +

    '<div class="entries">' +
    entryHtml('意向学员', '咨询未成交', '#14B8A6', '✉', 'leads') +
    entryHtml('正式学员', '在读学员管理', '#4C6FFF', '👥', 'students') +
    entryHtml('成长档案', '记录成长轨迹', '#8B5CF6', '📁', 'archives') +
    entryHtml('回访提醒', '自动到期提醒', '#F59E0B', '⏰', 'reminders') +
    '</div>' +

    '<div style="height:14px"></div>' +
    '<div class="card">' +
    '  <div class="card-title"><span>今日提醒</span><span class="link" data-go="reminders">查看全部 ›</span></div>' +
    remHtml +
    '</div>';
}

function entryHtml(title, desc, color, icon, view) {
  return '<div class="entry" data-go="' + view + '">' +
    '<div class="icon" style="background:' + color + '22;font-size:20px">' + icon + '</div>' +
    '<div><div class="t">' + title + '</div><div class="d">' + desc + '</div></div>' +
    '</div>';
}

function remRowHtml(r) {
  return '<div class="rem-row" data-go="reminders">' +
    avatarHtml(r.ownerName, 38) +
    '<div class="body"><div class="t">' + esc(r.title) +
    '  <span class="tag ' + (r.overdue ? 'overdue' : 'today') + '">' +
    (r.overdue ? '逾期' + diffDays(r.dueDate, today()) + '天' : '今日') + '</span></div>' +
    '  <div class="s">' + esc(r.ownerName) + ' · ' + r.dueDate + '</div></div>' +
    '<span class="go">去处理</span>' +
    '</div>';
}

/* ================= 正式学员：列表 ================= */
function renderStudents() {
  const kw = state.sKeyword.trim();
  const list = kw
    ? students.filter(s =>
        s.name.indexOf(kw) >= 0 || (s.parentWechat || '').indexOf(kw) >= 0 || (s.parentPhone || '').indexOf(kw) >= 0)
    : students;

  let body;
  if (list.length === 0) {
    body = emptyHtml('🗂', students.length === 0 ? '还没有正式学员，点击下方新增' : '没有匹配的学员');
  } else {
    body = list.map(s => {
      const n = studentDueReminders(s).length;
      return '<div class="item-row" data-id="' + s.id + '" data-act="sdetail">' +
        avatarHtml(s.name, 44) +
        '<div class="body">' +
        '  <div class="n">' + esc(s.name) +
        (s.gender ? ' <span style="font-size:11px;color:var(--sub);font-weight:400">' + esc(s.gender) + '</span>' : '') + '</div>' +
        '  <div class="meta">' + esc(s.grade || '未填年级') + ' · 激活 ' + (s.activateDate || '—') + '</div>' +
        '</div>' +
        (n > 0 ? '<div class="badge">' + n + '</div>' : '') +
        '</div>';
    }).join('');
  }

  app.innerHTML =
    '<div class="page-head">' +
    '  <div class="page-title">正式学员</div>' +
    '  <div class="page-sub">共 ' + students.length + ' 位在读学员</div>' +
    '</div>' +
    '<input class="search" id="s-search" placeholder="搜索姓名 / 家长微信 / 手机号" value="' + esc(state.sKeyword) + '">' +
    '<div style="height:12px"></div>' +
    body +
    '<div style="height:12px"></div>' +
    '<button class="btn primary full" id="s-add">＋ 新增学员</button>';

  document.getElementById('s-search').addEventListener('input', e => {
    state.sKeyword = e.target.value;
    renderStudents();
  });
  document.getElementById('s-add').addEventListener('click', () => openStudentForm(null));
  app.querySelectorAll('[data-act="sdetail"]').forEach(el => {
    el.addEventListener('click', () => {
      state.studentId = el.dataset.id;
      render();
      window.scrollTo(0, 0);
    });
  });
}

/* ================= 正式学员：表单 ================= */
function openStudentForm(stu) {
  const isEdit = !!stu;
  const s = stu || {};
  const sheet = openSheet(
    '<div class="form-item"><div class="lab">姓名 *</div><input type="text" id="f-name" value="' + esc(s.name || '') + '" placeholder="孩子姓名"></div>' +
    '<div class="form-item"><div class="lab">家长手机号</div><input type="tel" id="f-phone" value="' + esc(s.parentPhone || '') + '" placeholder="用于联系家长"></div>' +
    '<div class="form-item"><div class="lab">家长微信</div><input type="text" id="f-wechat" value="' + esc(s.parentWechat || '') + '" placeholder="家长微信号"></div>' +
    '<div class="form-item"><div class="lab">性别</div><div class="chips" id="f-gender">' + chipsHtml(GENDERS, [s.gender || '']) + '</div></div>' +
    '<div class="form-item"><div class="lab">出生年月</div><input type="date" id="f-birth" value="' + esc(s.birthDate || '') + '"></div>' +
    '<div class="form-item"><div class="lab">年级</div><input type="text" id="f-grade" value="' + esc(s.grade || '') + '" placeholder="如：三年级"></div>' +
    '<div class="form-item"><div class="lab">英语基础</div><div class="chips" id="f-level">' + chipsHtml(ENGLISH_LEVELS, [s.englishLevel || '']) + '</div></div>' +
    '<div class="form-item"><div class="lab">激活日期 *</div><input type="date" id="f-activate" value="' + esc(s.activateDate || today()) + '"></div>' +
    '<div class="form-item"><div class="lab">备注</div><textarea id="f-notes" placeholder="其他需要记录的信息">' + esc(s.notes || '') + '</textarea></div>' +
    '<div class="sheet-actions"><button class="btn ghost" data-act="cancel">取消</button>' +
    '<button class="btn primary" data-act="save">保存</button></div>',
    isEdit ? '编辑学员' : '新增学员'
  );

  bindChips(sheet);
  sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-act="save"]').addEventListener('click', () => {
    const name = sheet.querySelector('#f-name').value.trim();
    const activate = sheet.querySelector('#f-activate').value;
    if (!name) { toast('请填写学员姓名'); return; }
    if (!activate) { toast('请选择激活日期'); return; }
    const now = Date.now();
    if (isEdit) {
      Object.assign(s, {
        name: name,
        parentPhone: sheet.querySelector('#f-phone').value.trim(),
        parentWechat: sheet.querySelector('#f-wechat').value.trim(),
        gender: chipValue(sheet),
        birthDate: sheet.querySelector('#f-birth').value,
        grade: sheet.querySelector('#f-grade').value.trim(),
        englishLevel: chipValue(sheet),
        activateDate: activate,
        notes: sheet.querySelector('#f-notes').value.trim(),
        updateTime: now
      });
    } else {
      students.push({
        id: uid(), name: name,
        parentPhone: sheet.querySelector('#f-phone').value.trim(),
        parentWechat: sheet.querySelector('#f-wechat').value.trim(),
        gender: chipValue(sheet),
        birthDate: sheet.querySelector('#f-birth').value,
        grade: sheet.querySelector('#f-grade').value.trim(),
        englishLevel: chipValue(sheet),
        activateDate: activate,
        notes: sheet.querySelector('#f-notes').value.trim(),
        remindersDone: [],
        createTime: now, updateTime: now
      });
    }
    saveAll();
    closeSheet();
    toast('已保存');
    render();
  });
}

/* ================= 正式学员：详情 ================= */
function studentRecords(sid) {
  return records.filter(r => r.studentId === sid)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function renderStudentDetail() {
  const s = students.find(x => x.id === state.studentId);
  if (!s) { setView('students'); return; }
  const recs = studentRecords(s.id);

  let nextHtml;
  const m = nextStudentMilestone(s);
  if (!m) {
    nextHtml = '<div style="color:var(--success);font-size:13px">🎉 全部回访节点已完成</div>';
  } else {
    const due = milestoneDue(s, m);
    const flag = due < today() ? '（已到期）' : '';
    nextHtml = '<div class="rem-row" style="border:none;padding:4px 0" data-act="newrec">' +
      '<div class="body"><div class="t">' + m.title + '</div>' +
      '<div class="s">' + monthDay(due) + flag + '</div></div>' +
      '<span class="go">去记录 ›</span></div>';
  }

  let recHtml;
  if (recs.length === 0) {
    recHtml = '<div class="empty" style="padding:14px 0">还没有回访记录</div>';
  } else {
    recHtml = recs.map(r =>
      '<div class="tl-item" data-act="editrec" data-id="' + r.id + '">' +
      '  <div class="dot" style="background:var(--primary-light);color:var(--primary)">✓</div>' +
      '  <div class="body"><div class="t">' + esc(r.reminderTitle || '手动回访') + '</div>' +
      '  <div class="s">' + r.date + (r.parentFeedback ? ' · ' + esc(r.parentFeedback.slice(0, 24)) : '') + '</div></div>' +
      '</div>'
    ).join('');
  }

  app.innerHTML =
    backBar('学员详情', '<button class="act" data-act="edit">编辑</button>') +

    '<div class="card">' +
    '  <div style="display:flex;align-items:center;gap:12px">' +
    avatarHtml(s.name, 52) +
    '  <div style="flex:1"><div style="font-size:18px;font-weight:700">' + esc(s.name) +
    (s.gender ? ' <span class="chip" style="background:#F1F3F8;color:var(--sub)">' + esc(s.gender) + '</span>' : '') + '</div>' +
    '  <div style="font-size:12px;color:var(--sub)">激活日期：' + esc(s.activateDate || '—') + '</div></div>' +
    '  <button class="btn danger-text" data-act="del">删除</button>' +
    '  </div>' +
    '  <div class="divider"></div>' +
    detailRow('家长手机号', s.parentPhone) +
    detailRow('家长微信', s.parentWechat) +
    detailRow('出生年月', s.birthDate) +
    detailRow('年级', s.grade) +
    detailRow('英语基础', s.englishLevel) +
    (s.notes ? detailRow('备注', s.notes) : '') +
    '</div>' +

    '<div class="card">' +
    '  <div class="card-title"><span>下次回访</span><span class="link">自动按激活日期计算</span></div>' +
    nextHtml +
    '</div>' +

    '<div class="card">' +
    '  <div class="card-title"><span>回访记录</span>' +
    '  <span style="font-size:12px;color:var(--sub)">共 ' + recs.length + ' 条</span>' +
    '  <button class="act" data-act="newrec">＋ 新增回访</button></div>' +
    recHtml +
    '</div>';

  app.querySelector('[data-act="back"]').addEventListener('click', () => setView('students'));
  app.querySelector('[data-act="edit"]').addEventListener('click', () => openStudentForm(s));
  app.querySelector('[data-act="del"]').addEventListener('click', () => {
    confirmBox('删除学员', '将删除该学员及其全部回访记录，且不可恢复，确定删除？', () => {
      students = students.filter(x => x.id !== s.id);
      records = records.filter(r => r.studentId !== s.id);
      saveAll();
      toast('已删除');
      setView('students');
    }, '删除', true);
  });
  app.querySelectorAll('[data-act="newrec"]').forEach(el => {
    el.addEventListener('click', () => openRecordForm(null, s));
  });
  app.querySelectorAll('[data-act="editrec"]').forEach(el => {
    el.addEventListener('click', () => {
      const r = records.find(x => x.id === el.dataset.id);
      if (r) openRecordForm(r, s);
    });
  });
}

function detailRow(k, v) {
  return '<div class="detail-row"><div class="k">' + esc(k) + '</div><div class="v">' + (v ? esc(v) : '—') + '</div></div>';
}

/* ================= 回访记录：表单 ================= */
function openRecordForm(rec, stu, reminder) {
  const isEdit = !!rec;
  const r = rec || {};
  const st = stu || students.find(x => x.id === (r.studentId || (reminder && reminder.ownerId)));
  const title = (st ? st.name : '') + (reminder ? ' · ' + reminder.title : '');

  const sheet = openSheet(
    (st ? '<div style="font-size:13px;color:var(--sub);margin-bottom:12px">' + esc(st.name) +
      (reminder ? ' · ' + esc(reminder.title) : '') + '</div>' : '') +
    '<div class="form-item"><div class="lab">回访日期</div><input type="date" id="r-date" value="' + esc(r.date || today()) + '"></div>' +
    '<div class="form-item"><div class="lab">家长反馈</div><textarea id="r-feedback" placeholder="家长对课程/服务的反馈">' + esc(r.parentFeedback || '') + '</textarea></div>' +
    '<div class="form-item"><div class="lab">孩子目前遇到的问题</div><textarea id="r-problems" placeholder="学习中遇到的困难">' + esc(r.childProblems || '') + '</textarea></div>' +
    '<div class="form-item"><div class="lab">孩子进步表现</div><textarea id="r-progress" placeholder="值得肯定的进步点">' + esc(r.childProgress || '') + '</textarea></div>' +
    '<div class="form-item"><div class="lab">老师反馈建议</div><textarea id="r-advice" placeholder="给家长和孩子的建议">' + esc(r.teacherAdvice || '') + '</textarea></div>' +
    '<div class="form-item"><div class="lab">下一阶段计划</div><textarea id="r-plan" placeholder="下阶段学习安排">' + esc(r.nextPlan || '') + '</textarea></div>' +
    '<div class="sheet-actions">' +
    (isEdit ? '<button class="btn danger-text" data-act="del">删除</button>' : '') +
    '<button class="btn ghost" data-act="cancel">取消</button>' +
    '<button class="btn primary" data-act="save">保存</button></div>',
    isEdit ? '编辑回访' : '新增回访'
  );

  sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
  if (isEdit) {
    sheet.querySelector('[data-act="del"]').addEventListener('click', () => {
      confirmBox('删除回访记录', '确定删除这条回访记录？', () => {
        records = records.filter(x => x.id !== r.id);
        saveAll();
        closeSheet();
        toast('已删除');
        render();
      }, '删除', true);
    });
  }
  sheet.querySelector('[data-act="save"]').addEventListener('click', () => {
    const feedback = sheet.querySelector('#r-feedback').value.trim();
    const problems = sheet.querySelector('#r-problems').value.trim();
    const progress = sheet.querySelector('#r-progress').value.trim();
    const advice = sheet.querySelector('#r-advice').value.trim();
    if (!feedback && !problems && !progress && !advice) {
      toast('请至少填写一项回访内容');
      return;
    }
    if (isEdit) {
      Object.assign(r, {
        date: sheet.querySelector('#r-date').value,
        parentFeedback: feedback,
        childProblems: problems,
        childProgress: progress,
        teacherAdvice: advice,
        nextPlan: sheet.querySelector('#r-plan').value.trim()
      });
    } else {
      const sid = st ? st.id : '';
      if (!sid) { toast('缺少学员信息'); return; }
      const recId = uid();
      records.push({
        id: recId, studentId: sid, studentName: st.name,
        reminderKey: reminder ? reminder.key : '',
        reminderTitle: reminder ? reminder.title : '',
        date: sheet.querySelector('#r-date').value,
        parentFeedback: feedback,
        childProblems: problems,
        childProgress: progress,
        teacherAdvice: advice,
        nextPlan: sheet.querySelector('#r-plan').value.trim(),
        createTime: Date.now()
      });
      // 由提醒节点进入的新记录：自动标记该节点已完成
      if (reminder && reminder.isStudent) {
        const so = students.find(x => x.id === sid);
        if (so) {
          if (!so.remindersDone) so.remindersDone = [];
          if (so.remindersDone.indexOf(reminder.key) < 0) so.remindersDone.push(reminder.key);
        }
      }
    }
    saveAll();
    closeSheet();
    toast('已保存');
    render();
  });
}

/* ================= 意向学员：列表 ================= */
function renderLeads() {
  const kw = state.lKeyword.trim();
  const list = kw
    ? leads.filter(l =>
        l.wechatNickname.indexOf(kw) >= 0 || (l.childGrade || '').indexOf(kw) >= 0 || (l.source || '').indexOf(kw) >= 0)
    : leads.slice().sort((a, b) => ((a.consultDate || '') < (b.consultDate || '') ? 1 : -1));

  let body;
  if (list.length === 0) {
    body = emptyHtml('🗂', leads.length === 0 ? '还没有意向学员，点击下方新增' : '没有匹配的家长');
  } else {
    body = list.map(l => {
      const n = leadDueReminders(l).length;
      const sc = statusColor(l.followStatus);
      return '<div class="item-row" data-id="' + l.id + '" data-act="ldetail">' +
        avatarHtml(l.wechatNickname, 44) +
        '<div class="body">' +
        '  <div class="n">' + esc(l.wechatNickname) +
        '  <span class="chip" style="background:' + sc + '1A;color:' + sc + '">' + esc(l.followStatus) + '</span></div>' +
        '  <div class="meta">咨询 ' + esc(l.consultDate || '—') + (l.source ? ' · ' + esc(l.source) : '') + '</div>' +
        '</div>' +
        (n > 0 ? '<div class="badge">' + n + '</div>' : '') +
        '</div>';
    }).join('');
  }

  app.innerHTML =
    '<div class="page-head">' +
    '  <div class="page-title">意向学员</div>' +
    '  <div class="page-sub">共 ' + leads.length + ' 位咨询家长</div>' +
    '</div>' +
    '<input class="search" id="l-search" placeholder="搜索微信昵称 / 年级 / 来源" value="' + esc(state.lKeyword) + '">' +
    '<div style="height:12px"></div>' +
    body +
    '<div style="height:12px"></div>' +
    '<button class="btn primary full" id="l-add">＋ 新增意向学员</button>';

  document.getElementById('l-search').addEventListener('input', e => {
    state.lKeyword = e.target.value;
    renderLeads();
  });
  document.getElementById('l-add').addEventListener('click', () => openLeadForm(null));
  app.querySelectorAll('[data-act="ldetail"]').forEach(el => {
    el.addEventListener('click', () => {
      state.leadId = el.dataset.id;
      render();
      window.scrollTo(0, 0);
    });
  });
}

/* ================= 意向学员：表单 ================= */
function openLeadForm(lead) {
  const isEdit = !!lead;
  const l = lead || {};
  const sheet = openSheet(
    '<div class="form-item"><div class="lab">家长微信昵称 *</div><input type="text" id="lf-name" value="' + esc(l.wechatNickname || '') + '" placeholder="家长微信昵称"></div>' +
    '<div class="form-item"><div class="lab">咨询日期 *</div><input type="date" id="lf-date" value="' + esc(l.consultDate || today()) + '"></div>' +
    '<div class="form-item"><div class="lab">孩子年龄</div><input type="text" id="lf-age" value="' + esc(l.childAge || '') + '" placeholder="如：8岁"></div>' +
    '<div class="form-item"><div class="lab">孩子年级</div><input type="text" id="lf-grade" value="' + esc(l.childGrade || '') + '" placeholder="如：二年级"></div>' +
    '<div class="form-item"><div class="lab">英语基础</div><div class="chips" id="lf-level">' + chipsHtml(ENGLISH_LEVELS, [l.englishLevel || '']) + '</div></div>' +
    '<div class="form-item"><div class="lab">咨询来源</div><input type="text" id="lf-source" value="' + esc(l.source || '') + '" placeholder="如：朋友圈、转介绍、短视频"></div>' +
    '<div class="form-item"><div class="lab">家长关注点</div><div class="chips" id="lf-concerns">' + chipsHtml(CONCERNS, l.concerns || []) + '</div></div>' +
    '<div class="form-item"><div class="lab">跟进状态</div><div class="chips" id="lf-status">' + chipsHtml(FOLLOW_STATUSES, [l.followStatus || '新咨询']) + '</div></div>' +
    '<div class="form-item"><div class="lab">备注</div><textarea id="lf-notes" placeholder="咨询过程中的其他信息">' + esc(l.notes || '') + '</textarea></div>' +
    '<div class="sheet-actions"><button class="btn ghost" data-act="cancel">取消</button>' +
    '<button class="btn primary" data-act="save">保存</button></div>',
    isEdit ? '编辑意向学员' : '新增意向学员'
  );

  bindChips(sheet);
  sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-act="save"]').addEventListener('click', () => {
    const name = sheet.querySelector('#lf-name').value.trim();
    const consult = sheet.querySelector('#lf-date').value;
    if (!name) { toast('请填写家长微信昵称'); return; }
    if (!consult) { toast('请选择咨询日期'); return; }
    const now = Date.now();
    const data = {
      wechatNickname: name,
      consultDate: consult,
      childAge: sheet.querySelector('#lf-age').value.trim(),
      childGrade: sheet.querySelector('#lf-grade').value.trim(),
      englishLevel: chipValue(sheet),
      source: sheet.querySelector('#lf-source').value.trim(),
      concerns: chipsValues(sheet),
      followStatus: chipValue(sheet) || '新咨询',
      notes: sheet.querySelector('#lf-notes').value.trim(),
      updateTime: now
    };
    if (isEdit) {
      Object.assign(l, data);
    } else {
      data.id = uid();
      data.remindersDone = [];
      data.createTime = now;
      leads.push(data);
    }
    saveAll();
    closeSheet();
    toast('已保存');
    render();
  });
}

/* ================= 意向学员：详情 ================= */
function renderLeadDetail() {
  const l = leads.find(x => x.id === state.leadId);
  if (!l) { setView('leads'); return; }
  const sc = statusColor(l.followStatus);

  const concernHtml = (l.concerns && l.concerns.length)
    ? '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:6px 0">' +
      l.concerns.map(c => '<span class="chip" style="background:var(--primary-light);color:var(--primary)">' + esc(c) + '</span>').join('') +
      '</div>'
    : '';

  const mileHtml = LEAD_MILESTONES.map(m => {
    const due = leadMilestoneDue(l, m);
    let dot, col, txt;
    if (due === '') { dot = '✓'; col = '#E8F9EF'; dotCol = 'var(--success)'; txt = '已完成'; }
    else if (due < today()) { dot = '!'; col = '#FDEBEA'; dotCol = 'var(--danger)'; txt = '咨询后' + m.days + '天 · ' + monthDay(due) + '（待跟进）'; }
    else { dot = '·'; col = '#F1F3F8'; dotCol = 'var(--sub)'; txt = '咨询后' + m.days + '天 · ' + monthDay(due); }
    return '<div style="display:flex;gap:10px;align-items:center;padding:7px 0">' +
      '<div class="dot" style="background:' + col + ';color:' + dotCol + '">' + dot + '</div>' +
      '<div><div style="font-size:14px;font-weight:600">' + m.title + '</div>' +
      '<div style="font-size:12px;color:var(--sub)">' + txt + '</div></div></div>';
  }).join('');

  app.innerHTML =
    backBar('意向学员详情', '<button class="act" data-act="edit">编辑</button>') +

    '<div class="card">' +
    '  <div style="display:flex;align-items:center;gap:12px">' +
    avatarHtml(l.wechatNickname, 52) +
    '  <div style="flex:1"><div style="font-size:18px;font-weight:700">' + esc(l.wechatNickname) +
    '  <span class="chip" style="background:' + sc + '1A;color:' + sc + '">' + esc(l.followStatus) + '</span></div>' +
    '  <div style="font-size:12px;color:var(--sub)">咨询日期：' + esc(l.consultDate || '—') + '</div></div>' +
    '  <button class="btn danger-text" data-act="del">删除</button>' +
    '  </div>' +
    '  <div class="divider"></div>' +
    '<div style="display:flex;text-align:center;padding:6px 0">' +
    '  <div style="flex:1"><div style="font-size:14px;font-weight:600">' + esc(l.childAge || '—') + '</div><div style="font-size:11px;color:var(--sub)">孩子年龄</div></div>' +
    '  <div style="flex:1"><div style="font-size:14px;font-weight:600">' + esc(l.childGrade || '—') + '</div><div style="font-size:11px;color:var(--sub)">孩子年级</div></div>' +
    '  <div style="flex:1"><div style="font-size:14px;font-weight:600">' + esc(l.englishLevel || '—') + '</div><div style="font-size:11px;color:var(--sub)">英语基础</div></div>' +
    '  <div style="flex:1"><div style="font-size:14px;font-weight:600">' + esc(l.source || '—') + '</div><div style="font-size:11px;color:var(--sub)">咨询来源</div></div>' +
    '</div>' +
    concernHtml +
    (l.notes ? '<div style="font-size:13px;padding:4px 0">' + esc(l.notes) + '</div>' : '') +
    '</div>' +

    '<div class="card">' +
    '  <div class="card-title"><span>跟进节点</span><span class="link">按咨询日期自动计算</span></div>' +
    mileHtml +
    '</div>' +

    (l.followStatus === '已成交'
      ? '<div class="card" style="text-align:center;color:var(--success);font-size:13px">✓ 已成交，该家长已转为正式学员</div>'
      : '<button class="btn primary full" data-act="convert">转为正式学员</button>') +
    '<div style="height:10px"></div>';

  app.querySelector('[data-act="back"]').addEventListener('click', () => setView('leads'));
  app.querySelector('[data-act="edit"]').addEventListener('click', () => openLeadForm(l));
  app.querySelector('[data-act="del"]').addEventListener('click', () => {
    confirmBox('删除意向学员', '确定删除这位家长的信息？删除后不可恢复。', () => {
      leads = leads.filter(x => x.id !== l.id);
      saveAll();
      toast('已删除');
      setView('leads');
    }, '删除', true);
  });
  const cv = app.querySelector('[data-act="convert"]');
  if (cv) {
    cv.addEventListener('click', () => {
      confirmBox('转为正式学员', '将按意向信息创建学员档案（激活日期为今天），确定转化？', () => {
        const now = Date.now();
        students.push({
          id: uid(),
          name: l.wechatNickname,
          parentPhone: '',
          parentWechat: l.wechatNickname,
          gender: '',
          birthDate: '',
          grade: l.childGrade,
          englishLevel: l.englishLevel,
          activateDate: today(),
          notes: '由意向学员转化（' + (l.consultDate || '') + ' 咨询' + (l.source ? '，来源：' + l.source : '') + '）',
          remindersDone: ['d7'], // 转化即视为已完成首次学习回访
          createTime: now, updateTime: now
        });
        l.followStatus = '已成交';
        l.updateTime = now;
        saveAll();
        toast('已转为正式学员');
        render();
      }, '转化');
    });
  }
}

/* ================= 回访提醒页 ================= */
function renderReminders() {
  const t = today();
  const all = [];
  const sMap = {};
  const lMap = {};
  students.forEach(s => {
    sMap[s.id] = s;
    studentDueReminders(s).forEach(r => all.push(r));
  });
  leads.forEach(l => {
    lMap[l.id] = l;
    leadDueReminders(l).forEach(r => all.push(r));
  });
  all.sort((a, b) =>
    (a.overdue !== b.overdue) ? (a.overdue ? -1 : 1) :
    (a.dueDate < b.dueDate ? -1 : (a.dueDate > b.dueDate ? 1 : 0)));
  const list = state.rTab === 0 ? all.filter(r => r.isStudent) : all.filter(r => !r.isStudent);

  const rows = list.map(r =>
    '<div class="card" style="padding:13px">' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    avatarHtml(r.ownerName, 40) +
    '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">' + esc(r.title) +
    '  <span class="tag ' + (r.overdue ? 'overdue' : 'today') + '">' +
    (r.overdue ? '逾期' + diffDays(r.dueDate, t) + '天' : '今日') + '</span></div>' +
    '  <div style="font-size:12px;color:var(--sub)">' + esc(r.ownerName) + ' · ' + r.dueDate + '</div></div>' +
    '<button class="btn ghost" style="height:32px;padding:0 12px;font-size:12px" data-act="done" data-owner="' + r.ownerId + '" data-key="' + r.key + '">完成</button>' +
    (r.isStudent
      ? '<button class="btn primary" style="height:32px;padding:0 12px;font-size:12px" data-act="rec" data-owner="' + r.ownerId + '" data-key="' + r.key + '">去记录</button>'
      : '') +
    '</div></div>'
  ).join('');

  app.innerHTML =
    '<div class="page-head">' +
    '  <div class="page-title">回访提醒</div>' +
    '  <div class="page-sub">共 ' + all.length + ' 条待办 · 按激活/咨询日期自动计算</div>' +
    '</div>' +
    '<div class="seg" id="r-seg">' +
    '  <button data-tab="0" class="' + (state.rTab === 0 ? 'on' : '') + '">学员回访</button>' +
    '  <button data-tab="1" class="' + (state.rTab === 1 ? 'on' : '') + '">意向跟进</button>' +
    '</div>' +
    '<div style="height:12px"></div>' +
    (rows || emptyHtml('⏰', state.rTab === 0 ? '暂无到期的学员回访提醒' : '暂无到期的意向跟进提醒'));

  document.querySelectorAll('#r-seg button').forEach(b => {
    b.addEventListener('click', () => {
      state.rTab = +b.dataset.tab;
      renderReminders();
    });
  });
  app.querySelectorAll('[data-act="done"]').forEach(b => {
    b.addEventListener('click', () => {
      const key = b.dataset.key;
      if (state.rTab === 0) {
        const s = sMap[b.dataset.owner];
        if (s) {
          if (!s.remindersDone) s.remindersDone = [];
          if (s.remindersDone.indexOf(key) < 0) s.remindersDone.push(key);
        }
      } else {
        const l = lMap[b.dataset.owner];
        if (l) {
          if (!l.remindersDone) l.remindersDone = [];
          if (l.remindersDone.indexOf(key) < 0) l.remindersDone.push(key);
        }
      }
      saveAll();
      toast('已标记完成');
      renderReminders();
    });
  });
  app.querySelectorAll('[data-act="rec"]').forEach(b => {
    b.addEventListener('click', () => {
      const s = sMap[b.dataset.owner];
      const r = studentDueReminders(s).find(x => x.key === b.dataset.key);
      if (s && r) openRecordForm(null, s, r);
    });
  });
}

/* ================= 成长档案 ================= */
function renderArchives() {
  const groups = [];
  students.forEach(s => {
    const mine = records.filter(r => r.studentId === s.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (mine.length) groups.push({ s: s, recs: mine });
  });
  groups.sort((a, b) => (a.recs[0].date < b.recs[0].date ? 1 : -1));

  let body;
  if (groups.length === 0) {
    body = emptyHtml('📁', '暂无成长记录，先去完成一次回访吧');
  } else {
    body = groups.map(g => {
      const rows = g.recs.map(r =>
        '<div class="tl-item" data-act="editrec" data-id="' + r.id + '">' +
        '  <div class="dot" style="background:var(--primary-light);color:var(--primary)">✓</div>' +
        '  <div class="body"><div class="t">' + esc(r.reminderTitle || '手动回访') + '</div>' +
        '  <div class="s">' + r.date +
        (r.childProgress ? ' · 进步：' + esc(r.childProgress.slice(0, 22)) :
          (r.parentFeedback ? ' · 反馈：' + esc(r.parentFeedback.slice(0, 22)) : '')) +
        '</div></div>' +
        '</div>'
      ).join('');
      return '<div class="card">' +
        '<div class="group-head">' + avatarHtml(g.s.name, 40) +
        '<div style="flex:1"><div style="font-size:15px;font-weight:600">' + esc(g.s.name) +
        '  <span class="chip" style="background:var(--primary-light);color:var(--primary)">' + g.recs.length + ' 次回访</span></div>' +
        '  <div style="font-size:11px;color:var(--sub)">' + esc(g.s.grade || '未填年级') + '</div></div>' +
        '<button class="act" data-act="sdetail" data-id="' + g.s.id + '" style="font-size:12px">档案 ›</button>' +
        '</div>' +
        '<div class="divider"></div>' + rows + '</div>';
    }).join('');
  }

  app.innerHTML =
    backBar('成长档案', '<span style="font-size:12px;color:var(--sub)">' +
      (groups.length ? groups.length + ' 位学员有记录' : '') + '</span>') +
    body;

  app.querySelector('[data-act="back"]').addEventListener('click', () => setView('home'));
  app.querySelectorAll('[data-act="sdetail"]').forEach(el => {
    el.addEventListener('click', () => {
      state.studentId = el.dataset.id;
      render();
      window.scrollTo(0, 0);
    });
  });
  app.querySelectorAll('[data-act="editrec"]').forEach(el => {
    el.addEventListener('click', () => {
      const r = records.find(x => x.id === el.dataset.id);
      const s = students.find(x => x.id === (r ? r.studentId : ''));
      if (r) openRecordForm(r, s);
    });
  });
}

/* ================= 初始化 ================= */
function init() {
  // 全局跳转委托：首页快捷入口 / 今日提醒「查看全部」
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-go]');
    if (el) setView(el.dataset.go);
  });
  render();
}

init();
