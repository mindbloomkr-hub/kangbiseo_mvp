// js/pages/home.js — 홈 대시보드 (Firestore 실시간 연동)
import { subscribeLectures, authGuard } from '../api.js';
import { subscribeTodos, addTodo, clearDoneTodos, postponeAllTodayTodos } from '../services/todoService.js';
import { renderTodoList, bindTodoEvents } from '../components/todoComponent.js';
import { DAY_KO, escapeHtml, fmt, calcFee, getTodayString, fetchTravelMin, clearTravelCache, hexToRgba, timeToMin, minToTime, formatDateString, calcPaymentStatus, calculateSettlementStats } from '../utils.js';
import { initLectureModal, openModal, getTopicTags } from '../components/lectureModal.js';

/* ════════════════════════════════════════
   멀티데이 CSS — 1회 주입
════════════════════════════════════════ */
(function _initMultiDayCSS() {
  if (document.getElementById('tl-multiday-styles')) return;
  const s = document.createElement('style');
  s.id = 'tl-multiday-styles';
  s.textContent = [
    '.tl-multiday-badge{display:inline-flex;align-items:center;gap:2px;padding:1px 5px;border-radius:8px;',
    'background:rgba(124,58,237,.12);color:#7c3aed;font-size:10px;font-weight:700;',
    'margin-left:5px;vertical-align:middle;white-space:nowrap}',
    '.tl-card--multiday{border-left-style:dashed!important}',
  ].join('');
  document.head.appendChild(s);
})();

/* 출발지 선택기 + 임시 출발지 모달 CSS — 1회 주입 */
(function _initDepSelectorCSS() {
  if (document.getElementById('dep-selector-styles')) return;
  const s = document.createElement('style');
  s.id = 'dep-selector-styles';
  s.textContent = [
    '.dep-chip{padding:4px 12px;border-radius:20px;border:1.5px solid #d1d5db;',
    'background:#f9fafb;font-size:0.78rem;font-weight:600;color:#374151;cursor:pointer;',
    'transition:all .15s;white-space:nowrap;line-height:1.4;}',
    '.dep-chip:hover{background:#e5e7eb;border-color:#9ca3af;}',
    '.dep-chip--selected{background:#2563c4;color:#fff;border-color:#2563c4;}',
    '.dep-chip--selected:hover{background:#1d4ed8;border-color:#1d4ed8;}',
    '.dep-chip--edit{border-style:dashed;}',
    '.dep-chip--edit.dep-chip--selected{border-style:solid;}',
    '.dep-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;',
    'display:none;align-items:center;justify-content:center;padding:16px;}',
    '.dep-modal-backdrop.dep-modal-open{display:flex;}',
    '.dep-modal{background:#fff;border-radius:16px;width:100%;max-width:420px;',
    'box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden;}',
    '.dep-modal-hdr{display:flex;align-items:center;justify-content:space-between;',
    'padding:16px 20px;border-bottom:1px solid #f3f4f6;}',
    '.dep-modal-body{padding:20px;}',
    '.dep-modal-ftr{display:flex;justify-content:flex-end;gap:8px;',
    'padding:12px 20px;border-top:1px solid #f3f4f6;}',
    '.tl-loading{padding:20px 0;text-align:center;color:#6b7280;font-size:0.85rem;}',
  ].join('');
  document.head.appendChild(s);
})();

/* ════════════════════════════════════════
   멀티데이 슬라이스 — 날짜별 강의 분할
════════════════════════════════════════ */
function _sliceLectureForDay(lec, dayStr) {
  const startDate  = (lec.startDate != null ? lec.startDate : (lec.date != null ? lec.date : ''));
  const endDate    = (lec.endDate   != null ? lec.endDate   : (lec.date != null ? lec.date : ''));
  const timeStart  = (lec.startTime != null ? lec.startTime : (lec.timeStart != null ? lec.timeStart : ''));
  const timeEnd    = (lec.endTime   != null ? lec.endTime   : (lec.timeEnd   != null ? lec.timeEnd   : ''));
  const isMultiDay = startDate !== endDate;

  if (!isMultiDay) {
    return startDate === dayStr
      ? { ...lec, _sliceStart: timeStart, _sliceEnd: timeEnd, _isMultiDay: false, _sliceDate: dayStr }
      : null;
  }
  if (dayStr < startDate || dayStr > endDate) return null;

  let sliceStart, sliceEnd;
  if      (dayStr === startDate) { sliceStart = timeStart; sliceEnd = '24:00'; }
  else if (dayStr === endDate)   { sliceStart = '00:00';   sliceEnd = timeEnd; }
  else                           { sliceStart = '00:00';   sliceEnd = '24:00'; }

  return { ...lec, _sliceStart: sliceStart, _sliceEnd: sliceEnd, _isMultiDay: true, _sliceDate: dayStr };
}

/* 슬라이스 시간 접근자 (renderTimelineInto + _createTimelineCard 공용) */
const _ts = lec => (lec._sliceStart != null ? lec._sliceStart : (lec.startTime != null ? lec.startTime : (lec.timeStart != null ? lec.timeStart : '')));
const _te = lec => (lec._sliceEnd   != null ? lec._sliceEnd   : (lec.endTime   != null ? lec.endTime   : (lec.timeEnd   != null ? lec.timeEnd   : '')));
const _td = lec => (lec._sliceDate  != null ? lec._sliceDate  : (lec.date      != null ? lec.date      : ''));

/* ISO 8601 출발 시각 문자열 생성
   - 날짜 구분자를 점(.)→하이픈(-) 정규화 (Kakao 엄격 파싱 대응)
   - HH:MM 형식 시간을 받아 HH:MM:SS로 변환
   - 시각이 1440분(24:00) 이상이면 다음 날 00:00으로 진급 */
function _buildDepartureISO(dateStr, timeStr) {
  const date = (dateStr || '').replace(/\./g, '-');
  const tMin = timeToMin(timeStr || '00:00');
  if (tMin < 1440) return `${date}T${minToTime(tMin)}:00`;
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(y, mo - 1, d + 1);
  return `${formatDateString(dt)}T00:00:00`;
}


/* ════════════════════════════════════════
   강의별 색상 — topicTag 색상 우선, 없으면 중립 회색
════════════════════════════════════════ */
function getLectureColor(lec) {
  if (lec?.topicTagId != null) {
    const tag = getTopicTags().find(t => t.id === lec.topicTagId);
    if (tag?.color) return tag.color;
  }
  return '#e5e7eb';
}

/* ════════════════════════════════════════
   날짜 유틸 (home 전용)
════════════════════════════════════════ */
function getWeekDateStrings() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sun = new Date(today);
  sun.setDate(today.getDate() - today.getDay());
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    dates.push(formatDateString(d));
  }
  return dates;
}

/* ════════════════════════════════════════
   전역 상태
════════════════════════════════════════ */
let currentUser          = null;
let todos                = [];
let allLectures          = [];
let todayLectures        = [];
let tomorrowLectures     = [];
let unsubscribeTodos     = null;
let unsubscribeLectures  = null;
const _tlVersions        = {};   // stale-render guard: tracks the latest render request per container
const _suppliesState     = {};   // key: `${lecId}:${itemId}` → boolean (in-page checkbox state)
const _suppliesLoaded    = new Set(); // lecture IDs already hydrated from localStorage this session

function _loadSuppliesFromStorage(lecId) {
  try {
    const raw = localStorage.getItem(`gb_supplies_${lecId}`);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    saved.forEach(({ id, isChecked }) => {
      if (id != null) _suppliesState[`${lecId}:${id}`] = isChecked;
    });
  } catch {}
}

function _saveSuppliesState(lecId, card) {
  try {
    const cbs  = card.querySelectorAll('.supplies-check-cb');
    const items = [...cbs].map(cb => ({ id: cb.dataset.itemId, isChecked: cb.checked }));
    localStorage.setItem(`gb_supplies_${lecId}`, JSON.stringify(items));
  } catch {}
}

function _cleanupSuppliesStorage(allLecs) {
  try {
    const todayStr = getTodayString();
    const validIds = new Set(
      allLecs.filter(l => (l.endDate || l.date || '') >= todayStr).map(l => l.id)
    );
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('gb_supplies_')) continue;
      if (!validIds.has(key.slice('gb_supplies_'.length))) toDelete.push(key);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  } catch {}
}

function _parseSupplies(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s, i) => ({
      id:        s.id != null ? s.id : (i + 1),
      name:      typeof s === 'string' ? s : (s.name || ''),
      isChecked: s.isChecked ?? false,
    })).filter(s => s.name);
  }
  return String(raw).split(/[,;]+/).map(s => s.trim()).filter(Boolean)
    .map((name, i) => ({ id: i + 1, name, isChecked: false }));
}

function getDisplayName() {
  return localStorage.getItem('userNickname')
      || localStorage.getItem('userName')
      || '강사';
}

/* ════════════════════════════════════════
   1. nav-badge
════════════════════════════════════════ */
function updateNavBadge() {
  const todayStr = getTodayString();
  const count = allLectures.filter(l => l.date >= todayStr).length;
  localStorage.setItem('navBadgeCount', String(count));
  const badgeEl = document.getElementById('nav-badge-lectures');
  if (!badgeEl) return;
  badgeEl.textContent = count;
  badgeEl.style.display = count > 0 ? '' : 'none';
}

/* ════════════════════════════════════════
   2. 환영 인사
════════════════════════════════════════ */
function renderGreeting() {
  const greetEl    = document.getElementById('greeting-text');
  const subtitleEl = document.getElementById('greeting-subtitle');
  if (!greetEl) return;

  const h = new Date().getHours();
  let emoji, greet;
  if      (h < 12) { emoji = '☀️'; greet = '좋은 아침이에요';  }
  else if (h < 18) { emoji = '🌤'; greet = '즐거운 오후예요';  }
  else             { emoji = '🌙'; greet = '수고하신 하루예요'; }

  greetEl.innerHTML = `${emoji} ${getDisplayName()} 강사님, ${greet}!`;

  if (subtitleEl) {
    subtitleEl.textContent = todayLectures.length > 0
      ? `오늘 강의가 ${todayLectures.length}건 있어요. 이동 시간을 미리 확인해 두세요.`
      : '오늘은 강의 일정이 없어요. 다음 강의를 준비해 보세요.';
  }
}

/* 결제 상태 헬퍼는 utils.js의 calcPaymentStatus / calculateSettlementStats를 사용 */

/* ════════════════════════════════════════
   3. 상단 통계 카드
════════════════════════════════════════ */
function renderStatBar() {
  const container = document.getElementById('stat-bar');
  if (!container) return;

  const totalFee = todayLectures.reduce((sum, l) => sum + calcFee(l), 0);
  const todayStr = getTodayString();

  const { overdueLecs, pendingLecs, overdueAmt, pendingAmt } = calculateSettlementStats(allLectures, todayStr);
  console.log('[home] overdueLecs:', overdueLecs.length, 'pendingLecs:', pendingLecs.length);

  const unpaidIconCls = overdueLecs.length > 0
    ? 'stat-icon--red'
    : (pendingLecs.length > 0 ? 'stat-icon--yellow' : 'stat-icon--green');

  const stats = [
    { icon: '📅', iconCls: 'stat-icon--blue',   value: `${todayLectures.length}건`,                         label: '오늘 강의',      delta: '', delta2: '' },
    { icon: '💰', iconCls: 'stat-icon--green',  value: totalFee > 0 ? `${totalFee.toFixed(0)}만원` : '—',   label: '오늘 예상 수익', delta: '', delta2: '' },
    { icon: '⏱',  iconCls: 'stat-icon--yellow', value: todayLectures.length > 1 ? '이동 확인' : '—',         label: '이동 버퍼 타임', delta: '', delta2: '' },
    {
      icon: '💳', iconCls: unpaidIconCls,
      value:  `${overdueLecs.length + pendingLecs.length}건`,
      label:  '미입금 정산',
      delta:  overdueAmt > 0 ? `${fmt(overdueAmt)} 연체` : '',
      delta2: pendingAmt > 0 ? `${fmt(pendingAmt)} 대기` : '',
    },
  ];

  const hasUnpaid = overdueLecs.length + pendingLecs.length > 0;
  const filterParam = overdueLecs.length > 0 ? 'overdue' : 'pending';

  container.innerHTML = stats.map((s, i) => {
    const isUnpaid = i === 3;
    const clickAttr = isUnpaid && hasUnpaid
      ? ` role="button" tabindex="0" title="정산 관리 페이지로 이동 (미입금 내역 확인)" style="cursor:pointer"`
      : '';
    const dataAttr = isUnpaid && hasUnpaid ? ` data-unpaid-link="${filterParam}"` : '';
    return `
    <div class="stat-card"${clickAttr}${dataAttr}>
      <div class="stat-icon ${s.iconCls}">${s.icon}</div>
      <div class="stat-body">
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
        ${s.delta  ? `<div class="stat-delta stat-delta--down">${s.delta}</div>` : ''}
        ${s.delta2 ? `<div class="stat-delta" style="color:#f59e0b;font-size:0.7rem">${s.delta2}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Bind click/keyboard on unpaid card → settlement page
  const unpaidCard = container.querySelector('[data-unpaid-link]');
  if (unpaidCard) {
    const go = () => { location.href = `settlement.html?filter=${unpaidCard.dataset.unpaidLink}`; };
    unpaidCard.addEventListener('click', go);
    unpaidCard.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(); });
  }
}

/* ════════════════════════════════════════
   4. 오늘의 강의 브리핑 카드 (아코디언)
════════════════════════════════════════ */
function renderBriefingCards() {
  const container = document.getElementById('briefing-list');
  if (!container) return;

  if (todayLectures.length === 0) {
    container.innerHTML = `
      <div class="no-lecture-state">
        <div class="no-lecture-icon">📭</div>
        <p class="no-lecture-text">오늘 예정된 강의가 없어요.<br /><a href="lectures.html" style="color:var(--color-primary-500)">강의를 등록해 보세요 →</a></p>
      </div>`;
    return;
  }

  const todayStr = getTodayString();

  container.innerHTML = todayLectures.map((l, idx) => {
    const color     = getLectureColor(l);
    const payStatus = calcPaymentStatus(l, todayStr, allLectures);

    // Topic tag chip
    const _tag = l.topicTagId != null ? getTopicTags().find(t => t.id === l.topicTagId) : null;
    let topicChipHtml = '';
    if (_tag) {
      const _bg = (_tag.color != null ? _tag.color : '#7c3aed');
      const [_r, _g, _b] = [parseInt(_bg.slice(1,3),16), parseInt(_bg.slice(3,5),16), parseInt(_bg.slice(5,7),16)];
      const _fg = (0.299*_r + 0.587*_g + 0.114*_b) > 160 ? '#374151' : '#ffffff';
      topicChipHtml = `<span class="briefing-topic-chip" style="background:${_bg};color:${_fg};">${escapeHtml(_tag.name)}</span>`;
    }

    // Payment chip
    let payChipHtml = '';
    if (payStatus === 'overdue') {
      payChipHtml = `<span class="briefing-pay-chip briefing-pay-chip--overdue">연체</span>`;
    } else if (payStatus === 'pending') {
      payChipHtml = `<span class="briefing-pay-chip briefing-pay-chip--pending">입금대기</span>`;
    }

    // Time display
    const startDate  = (l.startDate != null ? l.startDate : (l.date != null ? l.date : ''));
    const endDate    = (l.endDate   != null ? l.endDate   : (l.date != null ? l.date : ''));
    const isMultiDay = startDate && endDate && startDate !== endDate;
    const fmtDate    = d => { const [,m,day] = d.split('-'); const dow = ['일','월','화','수','목','금','토'][new Date(d).getDay()]; return `${m}/${day}(${dow})`; };
    const timeRange  = isMultiDay
      ? `${fmtDate(startDate)} ${l.timeStart || ''} ~ ${fmtDate(endDate)} ${l.timeEnd || ''}`
      : `${l.timeStart || ''} – ${l.timeEnd || ''}`;

    // Duration
    let durationHtml = '';
    if (l.timeStart && l.timeEnd) {
      const dur = timeToMin(l.timeEnd) - timeToMin(l.timeStart);
      if (dur > 0) {
        const h = Math.floor(dur / 60), m = dur % 60;
        durationHtml = h > 0 && m > 0 ? `${h}시간 ${m}분` : h > 0 ? `${h}시간` : `${m}분`;
      }
    }

    // Session info
    const sessionHtml = (l.sessionCurrent && l.sessionTotal)
      ? `<span class="briefing-session">${l.sessionCurrent}/${l.sessionTotal}회차</span>`
      : '';

    // Fee
    const fee    = calcFee(l);
    const feeHtml = fee > 0 ? `${fmt(fee)}원` : '';

    // Parking
    const parkingHtml = l.parkingInfo
      ? `<div class="briefing-loc-item">🚗 ${escapeHtml(l.parkingInfo)}</div>`
      : '';
      
    // Time bar
    const tbParts = [];
    if (l.setupTime)  tbParts.push(`<span>🔧 준비&nbsp;${l.setupTime}분</span>`);
    /*if (l.timeStart)  tbParts.push(`<span class="briefing-tb-main">▶&nbsp;${l.timeStart}</span>`);
    if (l.timeEnd)    tbParts.push(`<span class="briefing-tb-main">■&nbsp;${l.timeEnd}</span>`);*/
    if (durationHtml) tbParts.push(`<span>⏱ &nbsp;${durationHtml}</span>`);
    if (l.wrapupTime) tbParts.push(`<span>📦 정리&nbsp;${l.wrapupTime}분</span>`);
    tbParts.push(`<span>💸 &nbsp;${feeHtml}</span>`);
    const timeBarHtml = tbParts.length > 0
      ? `<div class="briefing-timebar">${tbParts.map(part => `<div class="briefing-tb-cell">${part}</div>`).join('')}</div>`
      : '';    

    // Class info
    const ciItems = [];
    if (l.participants) ciItems.push(`<div class="briefing-ci-item"><span>👥</span><span>${escapeHtml(String(l.participants))}명</span></div>`);
    if (l.groupInfo)    ciItems.push(`<div class="briefing-ci-item"><span>👤</span><span>${escapeHtml(l.groupInfo)}</span></div>`);
    const classInfoHtml = ciItems.length > 0
      ? `<div class="briefing-class-info">${ciItems.join('')}</div>`
      : '';

    // Highlight boxes — supplies as interactive checklist
    const _supItems = _parseSupplies(l.supplies);
    if (!_suppliesLoaded.has(l.id)) {
      _suppliesLoaded.add(l.id);
      _loadSuppliesFromStorage(l.id);
    }
    let suppliesHtml = '';
    if (_supItems.length > 0) {
      const checkedCount = _supItems.filter(s => {
        const key = `${l.id}:${s.id}`;
        return _suppliesState[key] !== undefined ? _suppliesState[key] : s.isChecked;
      }).length;
      const supTotal = _supItems.length;
      const pct      = supTotal > 0 ? Math.round(checkedCount / supTotal * 100) : 0;
      suppliesHtml = `
        <div class="briefing-highlight briefing-highlight--supplies">
          <span class="briefing-hl-icon">⚠️</span>
          <div style="flex:1;min-width:0">
            <strong>준비물</strong>
            <div class="supplies-progress">
              <span class="supplies-progress-text">챙김: ${checkedCount}/${supTotal}</span>
              <div class="supplies-progress-bar-wrap"><div class="supplies-progress-bar" style="width:${pct}%"></div></div>
            </div>
            <div class="supplies-checklist">
              ${_supItems.map(item => {
                const key       = `${l.id}:${item.id}`;
                const isChecked = _suppliesState[key] !== undefined ? _suppliesState[key] : item.isChecked;
                return `<label class="supplies-check-item${isChecked ? ' is-checked' : ''}">` +
                  `<input type="checkbox" class="supplies-check-cb" ` +
                  `data-lec-id="${escapeHtml(l.id)}" data-item-id="${escapeHtml(String(item.id))}" ${isChecked ? 'checked' : ''} />` +
                  `<span>${escapeHtml(item.name)}</span></label>`;
              }).join('')}
            </div>
          </div>
        </div>`;
    }
    const memoHtml = l.memo
      ? `<div class="briefing-highlight briefing-highlight--memo"><span class="briefing-hl-icon">📝</span><div><strong>메모</strong><p>${escapeHtml(l.memo)}</p></div></div>`
      : '';

    // Manager / footer
    const mgrInitial = (l.managerName || '담').charAt(0);
    const footerHtml = `
      <div class="briefing-footer">
        <div class="briefing-manager">
          <div class="briefing-manager-avatar" style="background:${color};">${escapeHtml(mgrInitial)}</div>
          <span>담당자 · ${escapeHtml(l.managerName || '미등록')}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${l.managerPhone ? `<button class="briefing-contact-btn" data-phone="${escapeHtml(l.managerPhone)}">📞 연락하기</button>` : ''}
          <button class="briefing-detail-btn" data-id="${escapeHtml(l.id)}">📋 상세보기</button>
        </div>
      </div>`;

    // Row 3: session/payment chips only — chevron is in location row
    const row3Inner = [sessionHtml, payChipHtml].filter(Boolean).join('');
    const row3Html  = row3Inner ? `<div class="briefing-header-row3">${row3Inner}</div>` : '';


    return `
      <div class="lecture-briefing-card${idx === 0 ? ' is-expanded' : ''}" data-id="${escapeHtml(l.id)}" style="border-left:4px solid ${color};">
        <div class="briefing-card-header">
          <div class="briefing-header-row1">
            ${topicChipHtml}
            <span class="briefing-time">${timeRange}</span>
            <span class="briefing-client" style="margin-left:auto;">🏢 ${escapeHtml(l.client || '')}</span>
          </div>
          <div class="briefing-header-row2">
            <span class="briefing-title">${escapeHtml(l.title)}</span>
            <span class="briefing-topic">${escapeHtml(l.topic || '')}</span>
          </div>
          <div class="briefing-header-row-loc">
            ${l.place    ? `<span class="briefing-loc-item">📍 ${escapeHtml(l.place)}</span>`    : ''}
            ${l.classroom ? `<span class="briefing-loc-item">🚪 ${escapeHtml(l.classroom)}</span>` : ''}
            <span class="briefing-chevron">▼</span>
          </div>
          ${row3Html}
        </div>
        <div class="briefing-card-body">
          ${parkingHtml}
          ${timeBarHtml}
          ${classInfoHtml}
          ${suppliesHtml}
          ${memoHtml}
          ${footerHtml}
        </div>
      </div>`;
  }).join('');

  if (!container.dataset.delegated) {
    container.dataset.delegated = '1';
    container.addEventListener('click', e => {
      // Supplies checkbox toggle (must be first so it doesn't bubble to accordion)
      if (e.target.classList.contains('supplies-check-cb')) {
        const cb     = e.target;
        const lecId  = cb.dataset.lecId;
        const itemId = cb.dataset.itemId;
        _suppliesState[`${lecId}:${itemId}`] = cb.checked;
        cb.closest('.supplies-check-item')?.classList.toggle('is-checked', cb.checked);
        const card = cb.closest('.lecture-briefing-card');
        if (card) {
          const allCbs      = card.querySelectorAll('.supplies-check-cb');
          const checkedNow  = [...allCbs].filter(c => c.checked).length;
          const totalNow    = allCbs.length;
          const pctNow      = totalNow > 0 ? Math.round(checkedNow / totalNow * 100) : 0;
          const progText    = card.querySelector('.supplies-progress-text');
          const progBar     = card.querySelector('.supplies-progress-bar');
          if (progText) progText.textContent = `챙김: ${checkedNow}/${totalNow}`;
          if (progBar)  progBar.style.width  = `${pctNow}%`;
          _saveSuppliesState(lecId, card);
        }
        return;
      }

      const phoneBtn = e.target.closest('.briefing-contact-btn[data-phone]');
      if (phoneBtn) { window.location.href = `tel:${phoneBtn.dataset.phone}`; return; }

      const detailBtn = e.target.closest('.briefing-detail-btn[data-id]');
      if (detailBtn) { openModal(detailBtn.dataset.id); return; }

      const header = e.target.closest('.briefing-card-header');
      if (header) header.closest('.lecture-briefing-card')?.classList.toggle('is-expanded');
    });
  }
}

/* ════════════════════════════════════════
   5. 타임스케줄 (오늘 / 내일 공용)
════════════════════════════════════════ */

function getDeviceScheduler() {
  try {
    const _raw = localStorage.getItem('kangbiseo_device');
    const d = JSON.parse(_raw != null ? _raw : 'null');
    return (d != null && d.scheduler != null ? d.scheduler : {});
  } catch { return {}; }
}

function getEffectiveBufferTime() {
  const s = getDeviceScheduler();
  if (s.bufferTime === 'custom') return Number(s.bufferCustom) || 30;
  return Number(s.bufferTime) || 30;
}

/* ════════════════════════════════════════
   일별 출발지 — localStorage 날짜 독립 설정
   키: 'kangbiseo_daily_origins'
   값: { "YYYY-MM-DD": { type: "home"|"office"|"other"|"custom", customAddr: "" } }
════════════════════════════════════════ */
function _loadDailyOrigins() {
  try {
    const raw = localStorage.getItem('kangbiseo_daily_origins');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveDailyOrigins(obj) {
  localStorage.setItem('kangbiseo_daily_origins', JSON.stringify(obj));
}

function _getDailyOrigin(dateStr) {
  return _loadDailyOrigins()[dateStr] || null;
}

/* P1: daily override → P2: defaultOriginType from MyPage → P3: 'home' fallback */
function _getEffectiveOrigin(dateStr) {
  const daily = _getDailyOrigin(dateStr);
  if (daily) return daily;
  const sched = getDeviceScheduler();
  const defaultType = sched.defaultOriginType || 'home';
  return { type: defaultType, customAddr: '' };
}

function _setDailyOrigin(dateStr, type, customAddr = '') {
  const all = _loadDailyOrigins();
  all[dateStr] = { type, customAddr };
  _saveDailyOrigins(all);
}

/* 날짜에 해당하는 실제 출발 주소 문자열을 반환 */
function _resolveOriginAddr(dateStr) {
  const sched  = getDeviceScheduler();
  const addrs  = sched.addresses || {};
  const origin = _getEffectiveOrigin(dateStr);
  if (origin.type === 'custom') return origin.customAddr || '';
  return addrs[origin.type]?.trim() || addrs.home?.trim() || '';
}

/* 출발지 유형에 맞는 이모지 반환 */
function _getOriginEmoji(dateStr) {
  const type = _getEffectiveOrigin(dateStr).type;
  return { home: '🏠', office: '🏢', other: '📍', custom: '📍' }[type] || '🏠';
}

/* 출발지 유형의 짧은 이름 반환 (카드 제목용) */
function _getOriginLabel(dateStr) {
  const origin = _getEffectiveOrigin(dateStr);
  const NAMES = { home: '집', office: '사무실', other: '기타' };
  if (origin.type === 'custom') {
    const a = origin.customAddr || '';
    return a ? (a.length > 10 ? a.slice(0, 10) + '…' : a) : '직접 입력';
  }
  return NAMES[origin.type] || '집';
}

/* containerId → 해당 타임라인을 새로고침하는 함수 반환 */
function _getRefreshFn(containerId) {
  return containerId === 'tomorrow-timeline-list' ? renderTomorrowTimeline : renderTimeline;
}

/* ════════════════════════════════════════
   타임라인 강의 카드 — 오늘/내일 공용
════════════════════════════════════════ */
function _createTimelineCard(lec, isDone) {
  const sliceStart  = _ts(lec);
  const sliceEnd    = _te(lec);
  const isMultiDay  = (lec._isMultiDay != null ? lec._isMultiDay : false);

  const color     = getLectureColor(lec);
  // 타임라인 강의 카드 색상 불투명도 조절 5% 10%
  const bg        = hexToRgba(color, isDone ? 0.05 : 0.1);
  const nodeStyle = isDone
    ? 'background:#9ca3af;border-color:#9ca3af;'
    : `background:${color};border-color:${color};`;
  const cardStyle = [
    `background:${bg}`,
    `border:1px solid ${hexToRgba(color, 0.3)}`,
    `border-left:3px solid ${color}`,
    isDone ? 'opacity:0.7;' : '',
  ].join(';');

  const multidayBadge = isMultiDay
    ? `<span class="tl-multiday-badge">🌙 연속 일정(Multiday)</span>`
    : '';

  return `
      <div class="timeline-item" data-start-min="${timeToMin(sliceStart)}" data-end-min="${timeToMin(sliceEnd)}">
        <div class="tl-time-col"><div class="tl-time">${sliceStart}</div></div>
        <div class="tl-track"><div class="tl-node" style="${nodeStyle}"></div></div>
        <div class="tl-content">
          <div class="tl-card ${isDone ? 'tl-card--done' : 'tl-card--lecture'}${isMultiDay ? ' tl-card--multiday' : ''}"
               ${!isDone ? `data-id="${escapeHtml(lec.id)}"` : ''}
               style="${cardStyle}${!isDone ? 'cursor:pointer;' : ''}">
            <div class="tl-card-title">${escapeHtml(lec.title)}${multidayBadge}</div>
            <div class="tl-card-sub">${escapeHtml(lec.place || lec.client)} · ${sliceStart}~${sliceEnd}</div>
          </div>
        </div>
      </div>`;
}

/* ════════════════════════════════════════
   현재 시간 바 — DOM offsetTop 기반 위치 추적
   각 행의 data-start-min / data-end-min 속성을 읽어
   nowMin이 속한 행 내부의 로컬 비율로 픽셀 위치를 계산한다.
════════════════════════════════════════ */
function _injectNowBar(container, nowMin) {
  const rows = [...container.querySelectorAll('[data-start-min][data-end-min]')];
  if (rows.length === 0) return;

  const now    = new Date();
  const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  container.style.position = 'relative';
  const bar = document.createElement('div');
  bar.className    = 'tl-now-bar';
  bar.dataset.time = nowStr;
  container.appendChild(bar);

  const firstRow = rows[0];
  const lastRow  = rows[rows.length - 1];

  if (nowMin <= Number(firstRow.dataset.startMin)) {
    bar.style.top = `${firstRow.offsetTop}px`;
    return;
  }
  if (nowMin >= Number(lastRow.dataset.endMin)) {
    bar.style.top = `${lastRow.offsetTop + lastRow.offsetHeight}px`;
    return;
  }

  for (const row of rows) {
    const start = Number(row.dataset.startMin);
    const end   = Number(row.dataset.endMin);
    if (nowMin >= start && nowMin < end) {
      const ratio     = start === end ? 0 : (nowMin - start) / (end - start);
      const targetTop = row.offsetTop + row.offsetHeight * ratio;
      bar.style.top   = `${Math.round(targetTop)}px`;
      return;
    }
  }

  bar.style.top = `${lastRow.offsetTop + lastRow.offsetHeight}px`;
}

async function renderTimelineInto(containerId, lectures, showNowBar, dateStr) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (lectures.length === 0) {
    container.innerHTML = `
      <div class="no-lecture-state" style="padding:var(--space-8) 0;">
        <div class="no-lecture-icon">📭</div>
        <p class="no-lecture-text">${showNowBar ? '오늘 일정이 없어요.' : '내일은 강의가 없습니다.'}</p>
      </div>`;
    return;
  }

  const sched       = getDeviceScheduler();
  const bufferTime  = getEffectiveBufferTime();
  const _dStr       = dateStr || getTodayString();
  const originAddr  = _resolveOriginAddr(_dStr);   // P1: custom → P2: selected type → P3: home
  const originEmoji = _getOriginEmoji(_dStr);
  const hasOrigin   = !!originAddr;

  // Stamp this render. Any earlier in-flight render for the same container is now stale.
  const myVersion = (_tlVersions[containerId] = (_tlVersions[containerId] ?? 0) + 1);
  // Show loading feedback immediately (synchronous DOM update before any await).
  if (hasOrigin) {
    container.innerHTML = '<div class="tl-loading">⏳ 이동 시간 계산 중…</div>';
  }

  // Precompute inline chip HTML for the departure card (used before the await)
  const addrs         = sched.addresses || {};
  const curOrigin     = _getEffectiveOrigin(_dStr);
  const originLabel   = _getOriginLabel(_dStr);
  const _CHIP_DEFS    = [
    { type: 'home',   icon: '🏠', label: '집'    },
    { type: 'office', icon: '🏢', label: '사무실' },
    { type: 'other',  icon: '📍', label: '기타'   },
  ];
  const _customLbl = curOrigin.type === 'custom' && curOrigin.customAddr
    ? `✏️ ${curOrigin.customAddr.length > 14 ? curOrigin.customAddr.slice(0, 14) + '…' : curOrigin.customAddr}`
    : '✏️ 직접 입력';
  const inlineChipsHtml = [
    ..._CHIP_DEFS
      .filter(c => (addrs[c.type] || '').trim())
      .map(c => `<button type="button" class="dep-chip${curOrigin.type === c.type ? ' dep-chip--selected' : ''}"
                         data-type="${c.type}">${c.icon} ${c.label}</button>`),
    `<button type="button" class="dep-chip dep-chip--edit${curOrigin.type === 'custom' ? ' dep-chip--selected' : ''}"
             data-type="custom">${_customLbl}</button>`,
  ].join('');

  const firstLec = lectures[0];
  const lastLec  = lectures[lectures.length - 1];

  // Fetch all travel times using departure_time predictive routing (lecture date, not query time)
  const firstSetup  = Number(firstLec.setupTime != null ? firstLec.setupTime : (sched.setupTime != null ? sched.setupTime : 20));
  const lastWrapup  = Number(lastLec.wrapupTime != null ? lastLec.wrapupTime : (sched.wrapupTime != null ? sched.wrapupTime : 15));

  // departure_time = endTime of previous lecture (exact predictive slot, lecture date)
  const interLecPromises = lectures.slice(0, -1).map((lec, i) => {
    const next         = lectures[i + 1];
    const departureISO = _buildDepartureISO(_td(lec), _te(lec));
    return fetchTravelMin(lec.place, next.place, departureISO, null);
  });

  // Home → first: departure estimate = startTime − setup − buffer on the lecture's actual date
  const roughDepartureMin  = Math.floor((timeToMin(_ts(firstLec)) - firstSetup - bufferTime) / 10) * 10;
  const firstDepartureISO  = _buildDepartureISO(_td(firstLec), minToTime(roughDepartureMin));
  // Return: departure = endTime of last lecture + wrapup, on the lecture's actual date
  const returnDepartureMin = timeToMin(_te(lastLec)) + lastWrapup;
  const returnDepartureISO = _buildDepartureISO(_td(lastLec), minToTime(returnDepartureMin));
  const homePromises = hasOrigin
    ? [fetchTravelMin(originAddr, firstLec.place, firstDepartureISO, null), fetchTravelMin(lastLec.place, originAddr, returnDepartureISO, null)]
    : [Promise.resolve(null), Promise.resolve(null)];

  const [travelMins, [travelToFirst, travelToHome]] = await Promise.all([
    Promise.all(interLecPromises),
    Promise.all(homePromises),
  ]);

  // Round departure DOWN to nearest 10-min increment (08:17 → 08:10)
  const departureMin = hasOrigin
    ? Math.floor((timeToMin(_ts(firstLec)) - (firstSetup + bufferTime + (travelToFirst != null ? travelToFirst : 0))) / 10) * 10
    : null;
  const returnMin = hasOrigin
    ? timeToMin(_te(lastLec)) + lastWrapup + (travelToHome != null ? travelToHome : 0)
    : null;

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

// 1. 날짜 기준점 설정
const firstStartDate   = (firstLec.startDate != null ? firstLec.startDate : (firstLec.date != null ? firstLec.date : ''));
const lastEndDate      = (lastLec.endDate    != null ? lastLec.endDate    : (lastLec.date  != null ? lastLec.date  : ''));

// 2. 억제(Suppress) 로직 개선
// 출발 정보 억제: 연속 일정(isMultiDay)이면서, 현재 날짜(_sliceDate)가 실제 시작일이 아닐 때 (즉, 중간날이나 종료일일 때)
const suppressDeparture = firstLec._isMultiDay && firstLec._sliceDate !== firstStartDate;

// 귀가 정보 억제: 연속 일정(isMultiDay)이면서, 현재 날짜(_sliceDate)가 실제 종료일이 아닐 때 (즉, 시작날이나 중간날일 때)
const suppressReturn    = lastLec._isMultiDay  && lastLec._sliceDate !== lastEndDate;

const parts = [];

// ── 🏠 Home departure node (출발 정보 영역) ──────────────────────────────
// hasOrigin이 있고, suppressDeparture가 false일 때만(즉, 첫날에만) 출력
if (hasOrigin && !suppressDeparture) {
    const depStr = minToTime(departureMin);
    parts.push(`
      <div class="timeline-item">
        <div class="tl-time-col"><div class="tl-time">${depStr}</div></div>
        <div class="tl-track"><div class="tl-node tl-node--home"></div></div>
        <div class="tl-content">
          <div class="tl-card tl-card--home-origin" data-dep-card="1" data-date="${_dStr}">
            <div class="dep-card-main">
              <div class="dep-card-info">
                <div class="tl-card-title">${originEmoji} ${escapeHtml(originLabel)} 출발</div>
                <div class="tl-card-sub dep-card-addr">${escapeHtml(originAddr)}</div>
              </div>
              <button type="button" class="dep-edit-btn">출발지 수정</button>
            </div>
            <div class="dep-chip-group dep-chip-group--inline">
              ${inlineChipsHtml}
            </div>
          </div>
        </div>
      </div>`);

    // Home → First lecture gap (이동/버퍼/준비 정보)
    const t2f = (travelToFirst != null ? travelToFirst : 0);
    const totalMargin = t2f + bufferTime + firstSetup;
    parts.push(`
      <div class="tl-gap-row" data-start-min="${departureMin}" data-end-min="${timeToMin(_ts(firstLec))}">
        <div class="tl-time-col"></div>
        <div class="tl-track tl-gap-track"></div>
        <div class="tl-content">
          <div class="tl-gap-card tl-gap-card--info">
            <span class="tl-gap-icon">🚗</span>
            <div class="tl-gap-info">
              <div class="tl-gap-main">${travelToFirst == null ? '이동 시간 미확인' : `이동 ${t2f}분`} · 버퍼 ${bufferTime}분 · 준비 ${firstSetup}분</div>
              <div class="tl-gap-sub">출발 후 총 ${totalMargin}분 확보</div>
            </div>
          </div>
        </div>
      </div>`);
}

  // ── Lecture loop ─────────────────────────────────────
  for (let idx = 0; idx < lectures.length; idx++) {
    const lec    = lectures[idx];
    const isDone = showNowBar && timeToMin(_te(lec)) < nowMin;
    parts.push(_createTimelineCard(lec, isDone));

    // Gap row between consecutive lectures
    if (idx < lectures.length - 1) {
      const next       = lectures[idx + 1];
      const rawTravel  = travelMins[idx];
      const travelMin  = (rawTravel != null ? rawTravel : 0);
      const wrapup1    = Number(lec.wrapupTime  != null ? lec.wrapupTime  : (sched.wrapupTime != null ? sched.wrapupTime : 15));
      const setup2     = Number(next.setupTime  != null ? next.setupTime  : (sched.setupTime  != null ? sched.setupTime  : 20));
      const reqGap     = wrapup1 + travelMin + bufferTime + setup2;
      const actGap     = timeToMin(_ts(next)) - timeToMin(_te(lec));
      const targetArrivalMin = timeToMin(_ts(next)) - setup2 - bufferTime;
      const depStr     = minToTime(targetArrivalMin - travelMin);
      const arrivalStr = minToTime(targetArrivalMin);
      const isWarn     = actGap < reqGap;
      const travelLabel = rawTravel == null
        ? '이동 시간 미확인'
        : `이동 ${travelMin}분 · 도착 예정 ${arrivalStr}`;

      parts.push(`
        <div class="tl-gap-row${isWarn ? ' tl-gap-row--warn' : ''}" data-start-min="${timeToMin(_te(lec))}" data-end-min="${timeToMin(_ts(next))}">
          <div class="tl-time-col">
            <div class="tl-time" style="color:#9ca3af;">${depStr}</div>
          </div>
          <div class="tl-track tl-gap-track"></div>
          <div class="tl-content">
            <div class="tl-gap-card${isWarn ? ' tl-gap-card--warn' : ' tl-gap-card--ok'}">
              <span class="tl-gap-icon">${isWarn ? '⚠️' : '🚗'}</span>
              <div class="tl-gap-info">
                <div class="tl-gap-main">${travelLabel}</div>
                <div class="tl-gap-sub">필요 ${reqGap}분 (정리+이동+버퍼+준비) · 실제 ${actGap}분</div>
              </div>
              ${isWarn ? '<span class="tl-gap-warn-badge">촉박</span>' : ''}
            </div>
          </div>
        </div>`);
    }
  }

  // ── Home return node ─────────────────────────────────
  if (hasOrigin && !suppressReturn) {
    const t2h      = (travelToHome != null ? travelToHome : 0);
    const depStr   = minToTime(timeToMin(_te(lastLec)) + lastWrapup);
    const retStr   = minToTime(returnMin);

    parts.push(`
      <div class="tl-gap-row" data-start-min="${timeToMin(_te(lastLec))}" data-end-min="${returnMin}">
        <div class="tl-time-col">
          <div class="tl-time" style="color:#9ca3af;">${depStr}</div>
        </div>
        <div class="tl-track tl-gap-track"></div>
        <div class="tl-content">
          <div class="tl-gap-card tl-gap-card--info">
            <span class="tl-gap-icon">🏠</span>
            <div class="tl-gap-info">
              <div class="tl-gap-main">정리 ${lastWrapup}분 · ${travelToHome == null ? '이동 시간 미확인' : `이동 ${t2h}분`}</div>
              <div class="tl-gap-sub">귀가 예정 ${retStr}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="tl-time-col"><div class="tl-time">${retStr}</div></div>
        <div class="tl-track"><div class="tl-node tl-node--home"></div></div>
        <div class="tl-content">
          <div class="tl-card tl-card--home-origin">
            <div class="tl-card-title">${originEmoji} ${escapeHtml(originLabel)} 귀가</div>
            <div class="tl-card-sub dep-card-addr">${escapeHtml(originAddr)}</div>
          </div>
        </div>
      </div>`);
  }

  // Discard if a newer render has already started (rapid origin switches).
  if (_tlVersions[containerId] !== myVersion) return;

  container.innerHTML = parts.join('');

  // ── Event delegation (bound once per container) ──────────────────────────
  if (!container.dataset.delegated) {
    container.dataset.delegated = '1';
    const refreshFn = _getRefreshFn(containerId);
    container.addEventListener('click', e => {
      // Departure card: toggle chip panel
      const editBtn = e.target.closest('.dep-edit-btn');
      if (editBtn) {
        editBtn.closest('[data-dep-card]')
          ?.querySelector('.dep-chip-group--inline')
          ?.classList.toggle('dep-open');
        return;
      }

      // Departure card: select origin type chip
      const chip = e.target.closest('.dep-chip[data-type]');
      if (chip) {
        const type    = chip.dataset.type;
        const depCard = chip.closest('[data-dep-card]');
        const dateStr = depCard?.dataset.date || getTodayString();
        if (type === 'custom') {
          depCard?.querySelector('.dep-chip-group--inline')?.classList.remove('dep-open');
          openCustomOriginModal(dateStr, refreshFn);
        } else {
          _setDailyOrigin(dateStr, type, '');
          refreshFn();
        }
        return;
      }

      // Lecture card: open modal
      const lecCard = e.target.closest('.tl-card--lecture[data-id]');
      if (lecCard) openModal(lecCard.dataset.id);
    });
  }
  if (showNowBar) _injectNowBar(container, nowMin);
}

function _getTomorrowString() {
  const t = new Date(); t.setDate(t.getDate() + 1);
  return formatDateString(t);
}

function renderTimeline() {
  renderTimelineInto('timeline-list', todayLectures, true, getTodayString());
}

function renderTomorrowTimeline() {
  renderTimelineInto('tomorrow-timeline-list', tomorrowLectures, false, _getTomorrowString());
}

/* ════════════════════════════════════════
   임시 출발지 모달 (해당 날짜만 적용)
════════════════════════════════════════ */
function openCustomOriginModal(dateStr, refreshFn) {
  let backdrop = document.getElementById('dep-origin-modal');

  function closeModal() {
    if (backdrop) backdrop.classList.remove('dep-modal-open');
  }

  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id        = 'dep-origin-modal';
    backdrop.className = 'dep-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = `
      <div class="dep-modal">
        <div class="dep-modal-hdr">
          <span style="font-weight:700;font-size:0.95rem;">📍 이 날만 출발지 설정</span>
          <button id="dep-modal-close" type="button" aria-label="닫기"
                  style="background:none;border:none;cursor:pointer;font-size:1rem;
                         color:#6b7280;padding:4px 8px;border-radius:6px;">✕</button>
        </div>
        <div class="dep-modal-body">
          <p style="font-size:0.82rem;color:#6b7280;margin:0 0 12px;">
            이 날짜에만 적용되는 출발 주소를 설정합니다.<br />
            다른 날짜는 영향을 받지 않습니다.
          </p>
          <div style="display:flex;gap:8px;margin-bottom:6px;">
            <input id="dep-custom-input" type="text"
                   placeholder="주소를 입력하거나 검색하세요"
                   style="flex:1;padding:9px 12px;border:1.5px solid #d1d5db;border-radius:8px;
                          font-size:0.875rem;outline:none;box-sizing:border-box;"
                   autocomplete="off" />
            <button id="dep-kakao-btn" type="button"
                    style="height:38px;padding:0 12px;white-space:nowrap;background:#6bb2f5;
                           border:1.5px solid #5eadf8;border-radius:8px;font-size:0.75rem;
                           font-weight:700;color:#3c1e1e;cursor:pointer;flex-shrink:0;">
              🔍 검색
            </button>
          </div>
          <p id="dep-modal-hint" style="font-size:0.75rem;color:#ef4444;min-height:1em;margin:0;"></p>
        </div>
        <div class="dep-modal-ftr">
          <button id="dep-modal-cancel" type="button"
                  style="padding:8px 16px;border-radius:8px;border:1.5px solid #d1d5db;
                         background:#fff;cursor:pointer;font-size:0.85rem;color:#374151;">취소</button>
          <button id="dep-modal-confirm" type="button"
                  style="padding:8px 20px;border-radius:8px;border:none;background:#2563c4;
                         color:#fff;cursor:pointer;font-size:0.85rem;font-weight:700;">확인</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && backdrop.classList.contains('dep-modal-open')) closeModal();
    });
    document.getElementById('dep-modal-close')?.addEventListener('click', closeModal);
    document.getElementById('dep-modal-cancel')?.addEventListener('click', closeModal);
    document.getElementById('dep-kakao-btn')?.addEventListener('click', () => {
      if (typeof daum !== 'undefined' && daum.Postcode) {
        new daum.Postcode({
          oncomplete: data => {
            const addr = data.roadAddress || data.jibunAddress || '';
            if (addr) document.getElementById('dep-custom-input').value = addr;
            document.getElementById('dep-modal-hint').textContent = '';
          },
        }).open();
      } else {
        document.getElementById('dep-modal-hint').textContent = '주소 검색 서비스를 불러오는 중입니다.';
      }
    });
  }

  // Populate with current custom address for this date
  const current = _getDailyOrigin(dateStr);
  const input   = document.getElementById('dep-custom-input');
  if (input) input.value = current?.type === 'custom' ? (current.customAddr || '') : '';
  document.getElementById('dep-modal-hint').textContent = '';
  backdrop.classList.add('dep-modal-open');
  setTimeout(() => input?.focus(), 60);

  // Rebind confirm to current dateStr + refreshFn (swap node to clear old listener)
  const oldBtn = document.getElementById('dep-modal-confirm');
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  newBtn.addEventListener('click', () => {
    const addr = (document.getElementById('dep-custom-input')?.value || '').trim();
    if (!addr) {
      document.getElementById('dep-modal-hint').textContent = '주소를 입력해 주세요.';
      return;
    }
    _setDailyOrigin(dateStr, 'custom', addr);
    closeModal();
    refreshFn();
  });
  newBtn.addEventListener('keydown', e => { if (e.key === 'Enter') newBtn.click(); });
}

/* ════════════════════════════════════════
   6. 이번 주 일정
════════════════════════════════════════ */
function renderWeekly() {
  const gridEl    = document.getElementById('weekly-day-grid');
  const summaryEl = document.getElementById('weekly-summary');
  if (!gridEl) return;

  const today     = new Date(); today.setHours(0,0,0,0);
  const todayStr  = getTodayString();
  const weekDates = getWeekDateStrings();

  const dowToDateStr = {};
  weekDates.forEach(dateStr => { const d = new Date(dateStr); dowToDateStr[d.getDay()] = dateStr; });

  const dateToLectures = {};
  allLectures.forEach(lec => {
    if (weekDates.includes(lec.date)) {
      if (!dateToLectures[lec.date]) dateToLectures[lec.date] = [];
      dateToLectures[lec.date].push(lec);
    }
  });

  gridEl.innerHTML = [0,1,2,3,4,5,6].map(dow => {
    const dateStr  = dowToDateStr[dow];
    const dateObj  = dateStr ? new Date(dateStr) : null;
    const isToday  = dateStr === todayStr;
    const isPast   = dateObj && dateObj < today;
    const lectures = (dateToLectures[dateStr] || []).sort((a, b) => a.timeStart.localeCompare(b.timeStart));

    let daynameClass = 'week-col-dayname';
    if (isToday)        daynameClass += ' today-col';
    else if (dow === 0) daynameClass += ' sun';
    else if (dow === 6) daynameClass += ' sat';

    const dateNum  = dateObj ? dateObj.getDate() : '—';
    const lecCards = lectures.length > 0
      ? lectures.map(lec => {
          const color = getLectureColor(lec);
          return `
            <div class="week-lec-card" data-id="${escapeHtml(lec.id)}"
                 style="${isPast && !isToday ? 'opacity:0.55;' : ''}border-left:3px solid ${color};">
              <div class="week-lec-time">${lec.timeStart}</div>
              <div class="week-lec-title">${escapeHtml(lec.title)}</div>
            </div>`;
        }).join('')
      : `<div class="week-empty-day">—</div>`;

    return `
      <div class="week-col">
        <div class="${isToday ? 'week-col-header today-col' : 'week-col-header'}">
          <span class="${daynameClass}">${DAY_KO[dow]}</span>
          <div class="week-col-datenum ${isToday ? 'today' : ''}">${dateNum}</div>
        </div>
        ${lecCards}
      </div>`;
  }).join('');

  gridEl.querySelectorAll('.week-lec-card[data-id]').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });

  const weekTotal    = Object.values(dateToLectures).flat().length;
  const weekTotalFee = Object.values(dateToLectures).flat().reduce((s, l) => s + calcFee(l), 0);
  const daysWithLec  = Object.keys(dateToLectures).length;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="weekly-summary-item"><span>📋</span><span>이번 주 강의</span><span class="weekly-summary-value">${weekTotal}건</span></div>
      <div class="weekly-summary-item"><span>💰</span><span>예상 수익</span><span class="weekly-summary-value">₩${(weekTotalFee).toFixed(0)}만원</span></div>
      <div class="weekly-summary-item"><span>🚗</span><span>강의 있는 날</span><span class="weekly-summary-value">${daysWithLec}일</span></div>`;
  }
}

/* ════════════════════════════════════════
   7. 강의 Firestore 실시간 구독
════════════════════════════════════════ */
function initLectures(uid) {
  if (unsubscribeLectures) unsubscribeLectures();
  unsubscribeLectures = subscribeLectures(uid, snapshot => {
    allLectures = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    _cleanupSuppliesStorage(allLectures);

    const todayStr    = getTodayString();
    const tomorrowObj = new Date(); tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = formatDateString(tomorrowObj);

    todayLectures    = allLectures
      .map(l => _sliceLectureForDay(l, todayStr))
      .filter(Boolean)
      .sort((a, b) => _ts(a).localeCompare(_ts(b)));
    tomorrowLectures = allLectures
      .map(l => _sliceLectureForDay(l, tomorrowStr))
      .filter(Boolean)
      .sort((a, b) => _ts(a).localeCompare(_ts(b)));

    renderGreeting();
    renderStatBar();
    renderBriefingCards();
    renderTimeline();
    renderTomorrowTimeline();
    renderWeekly();
    updateNavBadge();
    // Refresh todo list so lecture-linked badges reflect current lecture data
    if (todos.length) _renderSidebarTodos();
  }, err => {
    console.error('[강비서] 강의 구독 오류:', err);
  });
}

/* ════════════════════════════════════════
   알림 벨 아이콘 — 드롭다운 피드백
════════════════════════════════════════ */
(function initNotificationBell() {
  const bell = document.querySelector('.topbar-notification');
  if (!bell) return;

  const dropdown = document.createElement('div');
  dropdown.id = 'notification-dropdown';
  Object.assign(dropdown.style, {
    display: 'none', position: 'absolute', top: 'calc(100% + 8px)', right: '0',
    width: '280px', background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: '9999',
    padding: '0', overflow: 'hidden',
  });
  dropdown.innerHTML = `
    <div style="padding:12px 16px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;font-size:0.9rem;">🔔 알림</div>
    <div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:0.85rem;">새로운 알림이 없습니다.</div>`;

  bell.style.position = 'relative';
  bell.appendChild(dropdown);

  let isOpen = false;
  bell.addEventListener('click', e => {
    e.stopPropagation();
    isOpen = !isOpen;
    dropdown.style.display = isOpen ? 'block' : 'none';
    bell.setAttribute('aria-expanded', String(isOpen));
  });
  document.addEventListener('click', () => {
    if (!isOpen) return;
    isOpen = false;
    dropdown.style.display = 'none';
  });
  bell.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bell.click(); }
    if (e.key === 'Escape') { isOpen = false; dropdown.style.display = 'none'; }
  });
})();

/* ════════════════════════════════════════
   To-do List — todoService + todoComponent 위임
════════════════════════════════════════ */

// Sidebar shows: overdue (incomplete only) + all of today's todos (done or not)
function _sidebarTodos(all) {
  const today = getTodayString();
  return all
    .filter(t => t.deadline === today || (!t.isDone && t.deadline < today))
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
}

function _renderSidebarTodos() {
  const listEl  = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  const visible = _sidebarTodos(todos);
  renderTodoList(listEl, visible, allLectures, getTopicTags());
  if (countEl) {
    const todayStr   = getTodayString();
    const overdue    = visible.filter(t => t.deadline < todayStr).length;
    const todayAll   = visible.filter(t => t.deadline === todayStr);
    const todayDone  = todayAll.filter(t => t.isDone).length;
    const todayCount = todayAll.length;
    countEl.textContent = overdue > 0
      ? `오늘 ${todayCount}건(완료 ${todayDone}) · 연체 ${overdue}건`
      : `오늘 ${todayCount}건(완료 ${todayDone})`;
  }
}

function initTodos(uid) {
  if (unsubscribeTodos) unsubscribeTodos();
  unsubscribeTodos = subscribeTodos(uid, updated => {
    todos = updated;
    _renderSidebarTodos();
  }, err => console.error('[강비서] Todo 구독 오류:', err));
}

async function todoAdd() {
  const input = document.getElementById('todo-input');
  const text  = input?.value.trim();
  if (!text || !currentUser) return;
  try { await addTodo(currentUser.uid, text, null); input.value = ''; }
  catch (err) { console.error('[강비서] Todo 추가 오류:', err); }
}

async function todoClearDone() {
  try { await clearDoneTodos(todos); }
  catch (err) { console.error('[강비서] 완료 항목 삭제 오류:', err); }
}

async function todoPostponeAll() {
  try {
    const count = await postponeAllTodayTodos(todos);
    if (count > 0) window.showToast?.(`${count}개의 할 일을 내일로 미뤘어요.`, 'success');
    else window.showToast?.('오늘 마감 할 일이 없어요.', 'info');
  } catch (err) { console.error('[강비서] 일괄 미루기 오류:', err); }
}

/* ════════════════════════════════════════
   이벤트 바인딩
════════════════════════════════════════ */
document.getElementById('todo-add-btn')?.addEventListener('click', todoAdd);
document.getElementById('todo-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') todoAdd(); });
document.getElementById('todo-clear-done')?.addEventListener('click', todoClearDone);
document.getElementById('todo-postpone-all')?.addEventListener('click', todoPostponeAll);
// Event delegation bound once — uses full todos so toggle/delete/postpone can find any item by id
bindTodoEvents(document.getElementById('todo-list'), () => todos, {
  getAllLectures: () => allLectures,
  openModal,
});

/* ════════════════════════════════════════
   초기 렌더 (빈 상태 — 데이터 로딩 전)
════════════════════════════════════════ */
renderGreeting();
renderStatBar();
renderBriefingCards();
renderTimeline();
renderTomorrowTimeline();
renderWeekly();
_renderSidebarTodos();

/* ════════════════════════════════════════
   인증 상태 감지 — 권한 가드 + 구독 시작
════════════════════════════════════════ */
authGuard(async user => {
  currentUser = user;
  clearTravelCache(); // 이전 세션에서 현재 시각 기준으로 캐싱된 phantom 결과 제거
  await initLectureModal(() => ({ allLectures, currentUser }));
  renderGreeting();
  initLectures(user.uid);
  initTodos(user.uid);
}, {
  withModal: true,
  cleanupFn: () => { unsubscribeTodos?.(); unsubscribeLectures?.(); },
});
