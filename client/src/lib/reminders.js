// 共享提醒/里程碑计算逻辑（学员 + 意向），供多个页面复用
export const STUDENT_MILESTONES = [
  { key: 'd7', days: 7, title: '首次学习回访' },
  { key: 'd30', days: 30, title: '一个月学习反馈' },
  { key: 'd90', days: 90, title: '三个月成长回访' },
  { key: 'd180', days: 180, title: '半年阶段复盘' },
  { key: 'd365', days: 365, title: '年度成长反馈' },
  { key: 'd730', days: 730, title: '两年学习复盘' },
  { key: 'd1095', days: 1095, title: '三年成长总结' },
];

export const LEAD_MILESTONES = [
  { key: 'f1', days: 1, title: '第一次跟进' },
  { key: 'f7', days: 7, title: '第二次跟进' },
  { key: 'f30', days: 30, title: '长期维护' },
  { key: 'f180', days: 180, title: '重新唤醒' },
];

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000);
}

export function calcStudentReminders(s, today = todayStr()) {
  const done = s.remindersDone || [];
  return STUDENT_MILESTONES
    .filter(m => !done.includes(m.key) && s.activateDate)
    .map(m => {
      const due = addDays(s.activateDate, m.days);
      if (due > today) return null;
      return {
        ownerId: s.id, ownerName: s.name, key: m.key, title: m.title,
        dueDate: due, days: m.days, overdue: due < today, isStudent: true
      };
    })
    .filter(Boolean);
}

export function calcLeadReminders(l, today = todayStr()) {
  const done = l.remindersDone || [];
  return LEAD_MILESTONES
    .filter(m => !done.includes(m.key) && l.consultDate)
    .map(m => {
      const due = addDays(l.consultDate, m.days);
      if (due > today) return null;
      return {
        ownerId: l.id, ownerName: l.wechatNickname, key: m.key, title: m.title,
        dueDate: due, days: m.days, overdue: due < today, isStudent: false
      };
    })
    .filter(Boolean);
}

export function calcAllDue(students, leads, today = todayStr()) {
  return [
    ...students.flatMap(s => calcStudentReminders(s, today)),
    ...leads.flatMap(l => calcLeadReminders(l, today)),
  ].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
  });
}

export function calcStudentDueCount(s, today = todayStr()) {
  return calcStudentReminders(s, today).length;
}

export function calcLeadDueCount(l, today = todayStr()) {
  return calcLeadReminders(l, today).length;
}

// 学员当前学习阶段（按学习时长）
export function stageLabel(s, today = todayStr()) {
  if (!s.activateDate) return '未激活';
  const days = diffDays(s.activateDate, today);
  if (days <= 0) return '新学员';
  if (days < 30) return '起步阶段';
  if (days < 90) return '适应阶段';
  if (days < 180) return '成长期';
  if (days < 365) return '稳步提升';
  return '持续进阶';
}

// 学习时长文本
export function durationText(s, today = todayStr()) {
  if (!s.activateDate) return '—';
  const days = diffDays(s.activateDate, today);
  if (days < 1) return '刚激活';
  if (days < 30) return `${days} 天`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月`;
  const years = Math.floor(months / 12);
  return `${years} 年 ${months % 12} 个月`;
}

// 简单格式化日期：MM月DD日
export function fmtMD(dateStr) {
  if (!dateStr) return '';
  const p = dateStr.split('-');
  if (p.length < 3) return dateStr;
  return `${+p[1]}月${+p[2]}日`;
}

// 意向学员跟进状态（展示集合）
export const LEAD_STATUSES = ['新咨询', '待回访', '已跟进', '高意向', '观望', '已转正式', '暂不跟进'];

export function leadStatusTone(status) {
  switch (status) {
    case '新咨询': return 'primary';
    case '待回访': return 'amber';
    case '已跟进': return 'sage';
    case '高意向': return 'rose';
    case '观望': return 'slate';
    case '已转正式': return 'primary';
    case '暂不跟进': return 'slate';
    default: return 'soft';
  }
}
