const STORAGE_KEY = 'ledgerx-trades-v1';
const DISCIPLINE_KEY = 'ledgerx-discipline-rules-v1';
const LOG_CONFIG_KEY = 'ledgerx-log-config-v1';
const SCORE_RULES_KEY = 'ledgerx-score-rules-v1';
const PRINCIPAL_KEY = 'ledgerx-principal-v1';

const DEFAULT_DISCIPLINE_RULES = [
  { id: 'stop-loss', name: '设置止损' },
  { id: 'trade-plan', name: '记录交易计划' }
];

const FIELD_DEFS = [
  { key: 'symbol', label: '交易对', fixed: true },
  { key: 'date', label: '日期', fixed: true },
  { key: 'side', label: '方向' },
  { key: 'status', label: '状态' },
  { key: 'entry', label: '入场价' },
  { key: 'exit', label: '出场价' },
  { key: 'size', label: '仓位金额 (USDT)' },
  { key: 'risk', label: '风险比例' },
  { key: 'stopLoss', label: '止损价' },
  { key: 'strategy', label: '策略' },
  { key: 'discipline', label: '交易纪律' },
  { key: 'score', label: '交易评分' },
  { key: 'notes', label: '交易计划与复盘' }
];

const COLUMN_DEFS = [
  { key: 'date', label: '日期', fixed: true },
  { key: 'symbol', label: '交易对', fixed: true },
  { key: 'side', label: '方向' },
  { key: 'prices', label: '入场 / 出场' },
  { key: 'size', label: '仓位' },
  { key: 'pnl', label: '盈亏' },
  { key: 'risk', label: '风险' },
  { key: 'stopLoss', label: '止损' },
  { key: 'strategy', label: '策略' },
  { key: 'status', label: '状态' },
  { key: 'discipline', label: '纪律' },
  { key: 'notes', label: '复盘' }
];

const FIELD_TO_COLUMN = {
  symbol: 'symbol',
  date: 'date',
  side: 'side',
  status: 'status',
  entry: 'prices',
  exit: 'prices',
  size: 'size',
  risk: 'risk',
  stopLoss: 'stopLoss',
  strategy: 'strategy',
  discipline: 'discipline',
  notes: 'notes'
};

const DEFAULT_LOG_CONFIG = {
  recordFields: Object.fromEntries(FIELD_DEFS.map(field => [field.key, true])),
  tableColumns: Object.fromEntries(COLUMN_DEFS.map(column => [
    column.key,
    ['date', 'symbol', 'side', 'prices', 'size', 'pnl', 'strategy', 'status'].includes(column.key)
  ])),
  recordLabels: Object.fromEntries(FIELD_DEFS.map(field => [field.key, field.label])),
  columnLabels: Object.fromEntries(COLUMN_DEFS.map(column => [column.key, column.label]))
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

let trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let disciplineRules = JSON.parse(localStorage.getItem(DISCIPLINE_KEY) || JSON.stringify(DEFAULT_DISCIPLINE_RULES));
let scoreRules = JSON.parse(localStorage.getItem(SCORE_RULES_KEY) || '[]');
let logConfig = normalizeLogConfig(JSON.parse(localStorage.getItem(LOG_CONFIG_KEY) || 'null'));
let tradeListMode = 'today';
let currentView = 'dashboard';
let principal = Number(localStorage.getItem(PRINCIPAL_KEY) || 0);

const currency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);
const number = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits });
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const on = (selector, event, handler) => {
  const node = $(selector);
  if (node) node.addEventListener(event, handler);
};

function normalizeLogConfig(config) {
  return {
    recordFields: { ...DEFAULT_LOG_CONFIG.recordFields, ...(config?.recordFields || {}) },
    tableColumns: { ...DEFAULT_LOG_CONFIG.tableColumns, ...(config?.tableColumns || {}) },
    recordLabels: { ...DEFAULT_LOG_CONFIG.recordLabels, ...(config?.recordLabels || {}) },
    columnLabels: { ...DEFAULT_LOG_CONFIG.columnLabels, ...(config?.columnLabels || {}) }
  };
}

function recordLabel(key) {
  return logConfig.recordLabels[key] || DEFAULT_LOG_CONFIG.recordLabels[key] || key;
}

function columnLabel(key) {
  return logConfig.columnLabels[key] || DEFAULT_LOG_CONFIG.columnLabels[key] || key;
}

function isRecordFieldEnabled(key) {
  return Boolean(logConfig.recordFields[key]);
}

function saveTrades() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

function saveDisciplineRules() {
  localStorage.setItem(DISCIPLINE_KEY, JSON.stringify(disciplineRules));
}

function saveScoreRules() {
  localStorage.setItem(SCORE_RULES_KEY, JSON.stringify(scoreRules));
}

function saveLogConfig() {
  localStorage.setItem(LOG_CONFIG_KEY, JSON.stringify(logConfig));
}

function savePrincipal() {
  localStorage.setItem(PRINCIPAL_KEY, String(principal || 0));
}

function calculatePnl(trade) {
  if (trade.status === 'open' || !trade.exit || !trade.entry || !trade.size) return null;
  const movement = (trade.exit - trade.entry) / trade.entry;
  return trade.size * (trade.side === 'long' ? movement : -movement);
}

function calculateScore(trade) {
  const selected = new Set(trade.scoreChecks || []);
  return scoreRules.reduce((sum, rule) => sum + (selected.has(rule.id) ? Number(rule.points || 0) : 0), 0);
}

function getRuleNames(ids, rules) {
  const names = Object.fromEntries(rules.map(rule => [rule.id, rule.name]));
  return (ids || []).map(id => names[id]).filter(Boolean).join(' / ');
}

function updateStats() {
  const closed = trades.filter(t => t.status === 'closed');
  const pnls = closed.map(calculatePnl).filter(pnl => pnl !== null);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  const net = pnls.reduce((sum, p) => sum + p, 0);
  const totalSize = closed.reduce((sum, t) => sum + (t.size || 0), 0);
  const rate = pnls.length ? wins.length / pnls.length * 100 : 0;
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const factor = avgLoss ? avgWin / avgLoss : avgWin ? avgWin : 0;
  const equity = principal + net;

  $('#principalAmount').textContent = currency(principal);
  $('#equityAmount').textContent = `权益 ${currency(equity)}`;
  $('#netProfit').textContent = currency(net);
  $('#netProfit').className = net < 0 ? 'down' : '';
  $('#profitChange').textContent = `${net >= 0 ? '+' : ''}${principal ? (net / principal * 100).toFixed(2) : '0.00'}%`;
  $('#profitChange').className = `pill ${net < 0 ? 'down' : 'up'}`;
  $('#winRate').textContent = `${rate.toFixed(1)}%`;
  $('#winRateBar').style.width = `${rate}%`;
  $('#winLoss').textContent = `${wins.length} 盈 / ${losses.length} 亏`;
  $('#profitFactor').textContent = number(factor);
  $('#tradeCount').textContent = trades.length;
  $('#openCount').textContent = `${trades.filter(t => t.status === 'open').length} 笔持仓中`;

  renderDisciplineSummary();
}

function renderDisciplineSummary() {
  if (!$('#disciplineList')) return;
  if (!disciplineRules.length) {
    $('#disciplineList').innerHTML = '<button type="button" class="empty-discipline" data-open-discipline>添加你的第一条纪律</button>';
    return;
  }

  $('#disciplineList').innerHTML = disciplineRules.map(rule => {
    const hits = trades.filter(trade => (trade.disciplineChecks || []).includes(rule.id)).length;
    const rate = trades.length ? Math.round(hits / trades.length * 100) : 0;
    return `<div><span>${escapeHtml(rule.name)}</span><strong>${rate}%</strong></div>`;
  }).join('');
}

function buildLine(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');
}

function scaleSeries(values, { minValue = null, maxValue = null } = {}) {
  if (!values.length) return [];
  const min = minValue ?? Math.min(...values, 0);
  const max = maxValue ?? Math.max(...values, 0);
  const spread = max - min || 1;
  return values.map((value, i) => {
    const x = values.length === 1 ? 400 : i / (values.length - 1) * 800;
    const y = 210 - ((value - min) / spread * 180);
    return [x, y, value];
  });
}

function renderDots(target, points, titleFormatter = value => value) {
  $(target).innerHTML = points.map(([x, y, value], index) => `<circle cx="${x}" cy="${y}" r="4"><title>第 ${index + 1} 单：${titleFormatter(value)}</title></circle>`).join('');
}

function updateProfitChart() {
  const closed = [...trades].filter(t => t.status === 'closed').sort((a, b) => a.date.localeCompare(b.date));
  const empty = $('#emptyChart');
  if (!closed.length) {
    empty.style.display = 'grid';
    $('#chartLine').setAttribute('d', '');
    $('#chartArea').setAttribute('d', '');
    $('#chartDots').innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  const cumulative = [];
  closed.reduce((sum, trade) => {
    const next = sum + (calculatePnl(trade) || 0);
    cumulative.push(next);
    return next;
  }, 0);
  const points = scaleSeries(cumulative);
  const line = buildLine(points);
  $('#chartLine').setAttribute('d', line);
  $('#chartArea').setAttribute('d', `${line} L 800 230 L 0 230 Z`);
  renderDots('#chartDots', points, value => currency(value));
}

function disciplineRateForTrade(trade) {
  if (!disciplineRules.length) return 0;
  const active = new Set(disciplineRules.map(rule => rule.id));
  const checked = (trade.disciplineChecks || []).filter(id => active.has(id)).length;
  return Math.round(checked / disciplineRules.length * 100);
}

function updateDisciplineTrendChart() {
  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const empty = $('#emptyDisciplineChart');
  if (!ordered.length) {
    empty.style.display = 'grid';
    $('#disciplineTrendLine').setAttribute('d', '');
    $('#disciplineTrendDots').innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  const points = scaleSeries(ordered.map(disciplineRateForTrade), { minValue: 0, maxValue: 100 });
  $('#disciplineTrendLine').setAttribute('d', buildLine(points));
  renderDots('#disciplineTrendDots', points, value => `${value}%`);
}

function updateScoreTrendChart() {
  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const empty = $('#emptyScoreChart');
  if (!ordered.length) {
    empty.style.display = 'grid';
    $('#scoreTrendLine').setAttribute('d', '');
    $('#scoreTrendDots').innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  const scores = ordered.map(calculateScore);
  const maxScore = Math.max(...scoreRules.map(rule => Number(rule.points || 0)).reduce((list, value) => {
    list.push((list.at(-1) || 0) + Math.max(value, 0));
    return list;
  }, []), ...scores, 1);
  const points = scaleSeries(scores, { minValue: 0, maxValue: maxScore });
  $('#scoreTrendLine').setAttribute('d', buildLine(points));
  renderDots('#scoreTrendDots', points, value => `${value} 分`);
}

function updateCharts() {
  updateProfitChart();
  updateDisciplineTrendChart();
  updateScoreTrendChart();
}

function updateFilters() {
  const current = $('#symbolFilter').value;
  const symbols = [...new Set(trades.map(t => t.symbol).filter(Boolean))].sort();
  $('#symbolFilter').innerHTML = '<option value="all">所有币种</option>' + symbols.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if (symbols.includes(current)) $('#symbolFilter').value = current;
}

function getVisibleTrades() {
  const symbol = $('#symbolFilter').value;
  const status = $('#statusFilter').value;
  const search = $('#searchInput').value.trim().toLowerCase();
  const currentDate = today();
  return [...trades].sort((a, b) => b.date.localeCompare(a.date)).filter(t => {
    const haystack = `${t.symbol || ''} ${t.strategy || ''} ${t.notes || ''}`.toLowerCase();
    return (tradeListMode === 'all' || t.date === currentDate) && (symbol === 'all' || t.symbol === symbol) && (status === 'all' || t.status === status) && (!search || haystack.includes(search));
  });
}

function updateTradeListCopy(visibleCount) {
  const isTodayMode = tradeListMode === 'today';
  $('#tradeListEyebrow').textContent = isTodayMode ? 'TODAY LOG' : 'TRADE LOG';
  $('#tradeListTitle').textContent = isTodayMode ? '今日交易' : '全部交易记录';
  $('#emptyTradesTitle').textContent = isTodayMode ? '今天还没有交易记录' : '没有符合条件的交易记录';
  $('#emptyTradesText').textContent = isTodayMode ? '记录今天的第一笔交易，保持复盘节奏。' : '可以调整筛选条件，或记录一笔新的交易。';
  $('#emptyTrades').style.display = visibleCount ? 'none' : 'block';
}

function renderTradeTableHead() {
  const columns = COLUMN_DEFS.filter(column => logConfig.tableColumns[column.key]);
  $('#tradeTableHead').innerHTML = `<tr>${columns.map(column => `<th>${escapeHtml(columnLabel(column.key))}</th>`).join('')}<th>评分</th><th></th></tr>`;
}

function columnValue(columnKey, trade) {
  const pnl = calculatePnl(trade);
  const pnlClass = pnl === null ? '' : pnl >= 0 ? 'profit-positive' : 'profit-negative';
  const values = {
    date: escapeHtml(trade.date || '—'),
    symbol: `<span class="symbol-cell"><strong>${escapeHtml(trade.symbol || '—')}</strong><span>PERPETUAL</span></span>`,
    side: `<span class="side-tag side-${trade.side || 'long'}">${trade.side === 'short' ? 'SHORT' : 'LONG'}</span>`,
    prices: `${trade.entry ? number(trade.entry) : '—'} <span class="muted">/</span> ${trade.exit ? number(trade.exit) : '—'}`,
    size: trade.size ? currency(trade.size) : '—',
    pnl: `<span class="${pnlClass}">${pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${currency(pnl)}`}</span>`,
    risk: trade.risk ? `${number(trade.risk, 1)}%` : '—',
    stopLoss: trade.stopLoss ? number(trade.stopLoss) : '—',
    strategy: escapeHtml(trade.strategy || '—'),
    status: `<span class="status-tag status-${trade.status || 'closed'}">${trade.status === 'open' ? '持仓中' : '已平仓'}</span>`,
    discipline: escapeHtml(getRuleNames(trade.disciplineChecks, disciplineRules) || '—'),
    notes: escapeHtml(trade.notes || '—')
  };
  return values[columnKey] || '—';
}

function renderTrades() {
  renderTradeTableHead();
  const visible = getVisibleTrades();
  updateTradeListCopy(visible.length);
  const columns = COLUMN_DEFS.filter(column => logConfig.tableColumns[column.key]);
  $('#tradeTableBody').innerHTML = visible.map(trade => `
    <tr class="trade-row" data-edit="${trade.id}" title="点击编辑这笔交易">
      ${columns.map(column => `<td>${columnValue(column.key, trade)}</td>`).join('')}
      <td><span class="score-total">${calculateScore(trade)}</span></td>
      <td><button class="delete-btn" data-delete="${trade.id}" title="删除">×</button></td>
    </tr>
  `).join('');
}

function setFieldVisibility() {
  FIELD_DEFS.forEach(field => {
    const node = document.querySelector(`[data-field="${field.key}"]`);
    if (!node) return;
    const visible = isRecordFieldEnabled(field.key);
    node.hidden = !visible;
    const labelNode = node.matches('label') ? node.querySelector('span') : node.querySelector('.checklist-head span');
    if (labelNode) labelNode.textContent = recordLabel(field.key);
    node.querySelectorAll('input, select, textarea').forEach(control => {
      if (control.type !== 'hidden') control.disabled = !visible;
    });
  });
}

function renderTradeDisciplineChecks(selected = []) {
  const box = $('#tradeDisciplineChecks');
  if (!disciplineRules.length) {
    box.innerHTML = '<p>还没有设置交易纪律，先添加几条你的交易原则。</p>';
    return;
  }

  const selectedSet = new Set(selected);
  box.innerHTML = disciplineRules.map(rule => `
    <label class="check-item">
      <input type="checkbox" name="disciplineChecks" value="${rule.id}" ${selectedSet.has(rule.id) ? 'checked' : ''}>
      <span>${escapeHtml(rule.name)}</span>
    </label>
  `).join('');
}

function renderTradeScoreChecks(selected = []) {
  const box = $('#tradeScoreChecks');
  if (!scoreRules.length) {
    box.innerHTML = '<p>还没有评分条目，先在“设置记录”里添加。</p>';
    return;
  }

  const selectedSet = new Set(selected);
  box.innerHTML = scoreRules.map(rule => `
    <label class="check-item score-check-item">
      <input type="checkbox" name="scoreChecks" value="${rule.id}" ${selectedSet.has(rule.id) ? 'checked' : ''}>
      <span>${escapeHtml(rule.name)}</span>
      <strong>${Number(rule.points || 0)} 分</strong>
    </label>
  `).join('');
}

function renderDisciplineRules() {
  const list = $('#disciplineRuleList');
  if (!disciplineRules.length) {
    list.innerHTML = '<div class="rule-empty">还没有规则，可以从你的入场、风控、复盘习惯开始。</div>';
    return;
  }

  list.innerHTML = disciplineRules.map(rule => `
    <div class="rule-item">
      <span>${escapeHtml(rule.name)}</span>
      <button type="button" data-delete-rule="${rule.id}" title="删除">×</button>
    </div>
  `).join('');
}

function renderLogSettings() {
  $('#recordFieldSettings').innerHTML = FIELD_DEFS.map(field => settingRow('record', field)).join('');
  $('#tableColumnSettings').innerHTML = COLUMN_DEFS.map(column => settingRow('column', column)).join('');
  renderScoreRules();
}

function settingRow(type, item) {
  const checked = type === 'record' ? logConfig.recordFields[item.key] : logConfig.tableColumns[item.key];
  const label = type === 'record' ? recordLabel(item.key) : columnLabel(item.key);
  const copyColumn = type === 'record' ? FIELD_TO_COLUMN[item.key] : '';
  return `
    <div class="setting-row" data-setting-row="${type}" data-setting-key="${item.key}" data-copy-column="${copyColumn || ''}" title="${copyColumn ? '点击复制到列表显示' : ''}">
      <input type="checkbox" data-setting-type="${type}" data-setting-key="${item.key}" ${checked ? 'checked' : ''} ${item.fixed ? 'disabled' : ''}>
      <input class="setting-name-input" data-label-type="${type}" data-label-key="${item.key}" value="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      ${item.fixed ? '<em>固定</em>' : ''}
      ${copyColumn ? '<button type="button" class="copy-column-button" data-copy-column-button>复制到列表</button>' : ''}
    </div>
  `;
}

function renderScoreRules() {
  const list = $('#scoreRuleList');
  if (!scoreRules.length) {
    list.innerHTML = '<div class="rule-empty">还没有评分条目。可以添加“按计划入场 20 分”这类规则。</div>';
    return;
  }

  list.innerHTML = scoreRules.map(rule => `
    <div class="rule-item">
      <span>${escapeHtml(rule.name)}</span>
      <strong>${Number(rule.points || 0)} 分</strong>
      <button type="button" data-delete-score="${rule.id}" title="删除">×</button>
    </div>
  `).join('');
}

function fillTradeForm(trade) {
  const form = $('#tradeForm');
  form.elements.id.value = trade?.id || '';
  form.elements.symbol.value = trade?.symbol || '';
  form.elements.date.value = trade?.date || today();
  form.elements.side.value = trade?.side || 'long';
  form.elements.status.value = trade?.status || 'closed';
  form.elements.entry.value = trade?.entry || '';
  form.elements.exit.value = trade?.exit || '';
  form.elements.size.value = trade?.size || '';
  form.elements.risk.value = trade?.risk || '';
  form.elements.stopLoss.value = trade?.stopLoss || '';
  form.elements.strategy.value = trade?.strategy || '';
  form.elements.notes.value = trade?.notes || '';
  renderTradeDisciplineChecks(trade?.disciplineChecks || []);
  renderTradeScoreChecks(trade?.scoreChecks || []);
}

function openTradeModal(trade = null) {
  $('#tradeForm').reset();
  setFieldVisibility();
  fillTradeForm(trade);
  $('#tradeModalEyebrow').textContent = trade ? 'EDIT ENTRY' : 'NEW ENTRY';
  $('#tradeModalTitle').textContent = trade ? '编辑交易' : '记录交易';
  $('#tradeModal').showModal();
}

function closeModal() { $('#tradeModal').close(); }

function openDisciplineModal() {
  renderDisciplineRules();
  $('#disciplineInput').value = '';
  if (!$('#disciplineModal').open) $('#disciplineModal').showModal();
  setTimeout(() => $('#disciplineInput').focus(), 50);
}

function closeDisciplineModal() { $('#disciplineModal').close(); }

function openLogSettingsModal() {
  renderLogSettings();
  if (!$('#logSettingsModal').open) $('#logSettingsModal').showModal();
}

function closeLogSettingsModal() { $('#logSettingsModal').close(); }

function openCapitalModal() {
  $('#principalInput').value = principal || '';
  $('#capitalModal').showModal();
  setTimeout(() => $('#principalInput').focus(), 50);
}

function closeCapitalModal() { $('#capitalModal').close(); }

function setView(view) {
  currentView = view;
  document.body.classList.remove('app-view-dashboard', 'app-view-trades', 'app-view-analytics');
  document.body.classList.add(`app-view-${view}`);
  tradeListMode = view === 'trades' ? 'all' : 'today';
  if (view === 'trades') {
    $('#symbolFilter').value = 'all';
    $('#statusFilter').value = 'all';
    $('#searchInput').value = '';
  }
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  renderTrades();
  if (view === 'analytics') updateCharts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 2200);
}

function valueFromForm(form, key, existing, fallback) {
  if (!isRecordFieldEnabled(key)) return existing?.[key] ?? fallback;
  return form.get(key);
}

function numberFromForm(form, key, existing, fallback = null) {
  if (!isRecordFieldEnabled(key)) return existing?.[key] ?? fallback;
  const value = form.get(key);
  return value === '' || value === null ? fallback : Number(value);
}

function collectTrade(form, existing) {
  return {
    id: existing?.id || crypto.randomUUID(),
    symbol: String(valueFromForm(form, 'symbol', existing, '未命名')).trim().toUpperCase().replace('-', '/'),
    date: valueFromForm(form, 'date', existing, today()),
    side: valueFromForm(form, 'side', existing, 'long'),
    status: valueFromForm(form, 'status', existing, 'closed'),
    entry: numberFromForm(form, 'entry', existing, null),
    exit: numberFromForm(form, 'exit', existing, null),
    size: numberFromForm(form, 'size', existing, null),
    risk: numberFromForm(form, 'risk', existing, 0),
    stopLoss: numberFromForm(form, 'stopLoss', existing, null),
    strategy: String(valueFromForm(form, 'strategy', existing, '') || '').trim(),
    notes: String(valueFromForm(form, 'notes', existing, '') || '').trim(),
    disciplineChecks: isRecordFieldEnabled('discipline') ? form.getAll('disciplineChecks') : existing?.disciplineChecks || [],
    scoreChecks: isRecordFieldEnabled('score') ? form.getAll('scoreChecks') : existing?.scoreChecks || []
  };
}

function render() {
  const openFormData = $('#tradeModal').open ? new FormData($('#tradeForm')) : null;
  setFieldVisibility();
  updateFilters();
  updateStats();
  updateCharts();
  renderTrades();
  renderTradeDisciplineChecks(openFormData?.getAll('disciplineChecks') || []);
  renderTradeScoreChecks(openFormData?.getAll('scoreChecks') || []);
}

$('#tradeForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = formData.get('id');
  const existing = trades.find(trade => trade.id === id);
  const nextTrade = collectTrade(formData, existing);
  if (isRecordFieldEnabled('status') && nextTrade.status === 'closed' && isRecordFieldEnabled('exit') && !nextTrade.exit) {
    event.currentTarget.querySelector('[name="exit"]').focus();
    showToast('已平仓交易需要填写出场价');
    return;
  }

  if (existing) {
    trades = trades.map(trade => trade.id === existing.id ? nextTrade : trade);
  } else {
    trades.push(nextTrade);
  }

  saveTrades();
  render();
  closeModal();
  showToast(existing ? '交易记录已更新' : '交易记录已保存');
});

$('#capitalForm').addEventListener('submit', (event) => {
  event.preventDefault();
  principal = Number($('#principalInput').value) || 0;
  savePrincipal();
  updateStats();
  closeCapitalModal();
  showToast('账户本金已保存');
});

$('#disciplineForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#disciplineInput');
  const name = input.value.trim();
  if (!name) return;
  disciplineRules.push({ id: crypto.randomUUID(), name });
  saveDisciplineRules();
  renderDisciplineRules();
  render();
  input.value = '';
  input.focus();
  showToast('交易纪律已添加');
});

$('#disciplineRuleList').addEventListener('click', (event) => {
  const id = event.target.dataset.deleteRule;
  if (!id) return;
  disciplineRules = disciplineRules.filter(rule => rule.id !== id);
  saveDisciplineRules();
  renderDisciplineRules();
  render();
  showToast('交易纪律已删除');
});

on('#disciplineList', 'click', (event) => {
  if (event.target.closest('[data-open-discipline]')) openDisciplineModal();
});

$('#logSettingsForm').addEventListener('change', (event) => {
  const type = event.target.dataset.settingType;
  const key = event.target.dataset.settingKey;
  if (!type || !key) return;
  if (type === 'record') logConfig.recordFields[key] = event.target.checked;
  if (type === 'column') logConfig.tableColumns[key] = event.target.checked;
  saveLogConfig();
  setFieldVisibility();
  renderTrades();
  showToast('记录设置已保存');
});

$('#logSettingsForm').addEventListener('input', (event) => {
  const type = event.target.dataset.labelType;
  const key = event.target.dataset.labelKey;
  if (!type || !key) return;
  const value = event.target.value.trim();
  if (type === 'record') logConfig.recordLabels[key] = value || DEFAULT_LOG_CONFIG.recordLabels[key];
  if (type === 'column') logConfig.columnLabels[key] = value || DEFAULT_LOG_CONFIG.columnLabels[key];
  saveLogConfig();
  setFieldVisibility();
  renderTrades();
});

$('#recordFieldSettings').addEventListener('click', (event) => {
  if (event.target.matches('input')) return;
  const row = event.target.closest('[data-copy-column]');
  const columnKey = row?.dataset.copyColumn;
  if (!columnKey) return;
  logConfig.tableColumns[columnKey] = true;
  const fieldKey = row.dataset.settingKey;
  if (fieldKey && columnKey !== 'prices') {
    logConfig.columnLabels[columnKey] = recordLabel(fieldKey);
  }
  saveLogConfig();
  renderLogSettings();
  renderTrades();
  showToast(`已复制到列表显示：${columnLabel(columnKey)}`);
});

$('#logSettingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
});

$('#addScoreRule').addEventListener('click', () => {
  const name = $('#scoreNameInput').value.trim();
  const points = Number($('#scorePointsInput').value);
  if (!name || Number.isNaN(points)) {
    showToast('请填写评分条目和分数');
    return;
  }
  scoreRules.push({ id: crypto.randomUUID(), name, points });
  saveScoreRules();
  renderScoreRules();
  render();
  $('#scoreNameInput').value = '';
  $('#scorePointsInput').value = '';
  $('#scoreNameInput').focus();
  showToast('评分条目已添加');
});

$('#scoreRuleList').addEventListener('click', (event) => {
  const id = event.target.dataset.deleteScore;
  if (!id) return;
  scoreRules = scoreRules.filter(rule => rule.id !== id);
  saveScoreRules();
  renderScoreRules();
  render();
  showToast('评分条目已删除');
});

$('#tradeTableBody').addEventListener('click', (event) => {
  const deleteId = event.target.dataset.delete;
  if (deleteId) {
    if (!confirm('确认删除这笔交易记录？')) return;
    trades = trades.filter(t => t.id !== deleteId);
    saveTrades();
    render();
    showToast('交易记录已删除');
    return;
  }

  const row = event.target.closest('[data-edit]');
  if (!row) return;
  const trade = trades.find(item => item.id === row.dataset.edit);
  if (trade) openTradeModal(trade);
});

$('#exportBtn').addEventListener('click', () => {
  if (!trades.length) return showToast('暂无可导出的交易记录');
  const headers = ['日期','交易对','方向','状态','入场价','出场价','仓位USDT','盈亏USDT','风险%','止损价','策略','已执行纪律','评分条目','总分','复盘'];
  const rows = trades.map(t => [
    t.date, t.symbol, t.side, t.status, t.entry || '', t.exit || '', t.size || '',
    calculatePnl(t) ?? '', t.risk || '', t.stopLoss || '', t.strategy,
    getRuleNames(t.disciplineChecks, disciplineRules),
    getRuleNames(t.scoreChecks, scoreRules),
    calculateScore(t),
    t.notes
  ]);
  const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `ledgerx-trades-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

on('#openTradeModal', 'click', () => openTradeModal());
on('#emptyAddBtn', 'click', () => openTradeModal());
on('#closeModal', 'click', closeModal);
on('#cancelModal', 'click', closeModal);
on('#openDisciplineModal', 'click', openDisciplineModal);
on('#editDisciplineFromTrade', 'click', openDisciplineModal);
on('#closeDisciplineModal', 'click', closeDisciplineModal);
on('#openLogSettingsModal', 'click', openLogSettingsModal);
on('#editScoreFromTrade', 'click', openLogSettingsModal);
on('#closeLogSettingsModal', 'click', closeLogSettingsModal);
on('#openCapitalModal', 'click', openCapitalModal);
on('#closeCapitalModal', 'click', closeCapitalModal);
on('#cancelCapitalModal', 'click', closeCapitalModal);
on('#disciplineModal', 'click', e => { if (e.target === $('#disciplineModal')) closeDisciplineModal(); });
on('#logSettingsModal', 'click', e => { if (e.target === $('#logSettingsModal')) closeLogSettingsModal(); });
on('#capitalModal', 'click', e => { if (e.target === $('#capitalModal')) closeCapitalModal(); });
on('#tradeModal', 'click', e => { if (e.target === $('#tradeModal')) closeModal(); });
['symbolFilter','statusFilter'].forEach(id => $(`#${id}`).addEventListener('change', renderTrades));
$('#searchInput').addEventListener('input', renderTrades);
$('#themeToggle').addEventListener('click', () => document.body.classList.toggle('light'));
$$('.nav-item').forEach(button => button.addEventListener('click', () => {
  setView(button.dataset.view);
}));
$$('.range-tabs button').forEach(btn => btn.addEventListener('click', () => {
  $$('.range-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}));

$('#todayLabel').textContent = new Intl.DateTimeFormat('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' }).format(new Date()).toUpperCase();
render();
