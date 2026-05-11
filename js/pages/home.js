// js/pages/home.js — 홈 대시보드 (Firestore 실시간 연동)
import { subscribeLectures, authGuard } from '../api.js';
import { subscribeTodos, addTodo, clearDoneTodos, postponeAllTodayTodos } from '../services/todoService.js';
import { renderTodoList, bindTodoEvents } from '../components/todoComponent.js';
import { DAY_KO, escapeHtml, getTodayString, fetchTravelMin, hexToRgba, timeToMin, minToTime, formatDateString, calcPaymentDate } from '../utils.js';
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

/* ════════════════════════════════════════
   멀티데이 슬라이스 — 날짜별 강의 분할
════════════════════════════════════════ */
function _sliceLectureForDay(lec, dayStr) {
  const startDate  = lec.startDate ?? lec.date ?? '';
  const endDate    = lec.endDate   ?? lec.date ?? '';
  const timeStart  = lec.startTime ?? lec.timeStart ?? '';
  const timeEnd    = lec.endTime   ?? lec.timeEnd   ?? '';
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
const _ts = lec => lec._sliceStart ?? (lec.startTime ?? lec.timeStart ?? '');
const _te = lec => lec._sliceEnd   ?? (lec.endTime   ?? lec.timeEnd   ?? '');
const _td = lec => lec._sliceDate  ?? lec.date ?? '';

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

/* ════════════════════════════════════════
   결제 상태 헬퍼
════════════════════════════════════════ */
function _getPaymentDeadline(lec) {
  if (lec.paymentDate) return lec.paymentDate;
  const baseDate = lec.endDate ?? lec.date ?? '';
  return baseDate ? calcPaymentDate(baseDate, lec.settlementCycle || '', null) : null;
}

function _paymentStatus(lec, todayStr) {
  if (lec.isPaid) return 'paid';
  const deadline = _getPaymentDeadline(lec);
  if (!deadline) return 'pending';
  return todayStr >= deadline ? 'overdue' : 'pending';
}

/* ════════════════════════════════════════
   3. 상단 통계 카드
════════════════════════════════════════ */
function renderStatBar() {
  const container = document.getElementById('stat-bar');
  if (!container) return;

  const totalFee = todayLectures.reduce((sum, l) => sum + (Number(l.fee) || 0), 0);
  const now0     = new Date(); now0.setHours(0, 0, 0, 0);
  const todayStr = getTodayString();

  const pastUnpaid  = allLectures.filter(l => {
    const d = new Date(l.date); d.setHours(0, 0, 0, 0);
    return !l.isPaid && d < now0;
  });
  const overdueLecs = pastUnpaid.filter(l => _paymentStatus(l, todayStr) === 'overdue');
  const pendingLecs = pastUnpaid.filter(l => _paymentStatus(l, todayStr) === 'pending');
  const overdueAmt  = overdueLecs.reduce((s, l) => s + (Number(l.fee) || 0), 0);
  const pendingAmt  = pendingLecs.reduce((s, l) => s + (Number(l.fee) || 0), 0);

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
      delta:  overdueAmt > 0 ? `₩${(overdueAmt * 10000).toLocaleString()} 연체` : '',
      delta2: pendingAmt > 0 ? `₩${(pendingAmt * 10000).toLocaleString()} 대기` : '',
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
   4. 오늘의 강의 브리핑 카드
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
  container.innerHTML = todayLectures.map((l) => {
    const color      = getLectureColor(l);
    const mgrInitial = (l.managerName || '담').charAt(0);
    const payStatus  = _paymentStatus(l, todayStr);
    const payChip    = !l.isPaid
      ? payStatus === 'overdue'
        ? `<span class="status-chip" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;margin-left:4px">연체</span>`
        : `<span class="status-chip" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;margin-left:4px">입금 대기</span>`
      : '';
    return `
      <div class="lecture-briefing-card" data-id="${escapeHtml(l.id)}"
           style="cursor:pointer;position:relative;border-left:4px solid ${color};">
        <div class="briefing-body" style="padding-left:8px;">
          <div class="briefing-row-top">
            <span class="briefing-time">${l.timeStart} – ${l.timeEnd}</span>
            <span class="status-chip status-chip--scheduled">예정</span>${payChip}
          </div>
          <div class="briefing-title">${escapeHtml(l.title)}</div>
          <div class="briefing-meta-grid">
            <div class="briefing-meta-item"><span class="briefing-meta-icon">🏢</span><span class="briefing-meta-text">${escapeHtml(l.client)}</span></div>
            <div class="briefing-meta-item"><span class="briefing-meta-icon">📍</span><span class="briefing-meta-text">${escapeHtml(l.place || '장소 미정')}</span></div>
            <div class="briefing-meta-item"><span class="briefing-meta-icon">⏱</span><span class="briefing-meta-text">${l.timeStart} ~ ${l.timeEnd}</span></div>
            <div class="briefing-meta-item"><span class="briefing-meta-icon">💰</span><span class="briefing-meta-text">₩${(Number(l.fee)*10000||0).toLocaleString()}</span></div>
          </div>
        </div>
        <div class="briefing-footer">
          <div class="briefing-manager">
            <div class="briefing-manager-avatar" style="background:${color};">${escapeHtml(mgrInitial)}</div>
            <span>담당자 · ${escapeHtml(l.managerName || '미등록')}</span>
          </div>
          ${l.managerPhone
            ? `<button class="briefing-contact-btn" onclick="event.stopPropagation();window.location.href='tel:${l.managerPhone}'">📞 연락하기</button>`
            : ''}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.lecture-briefing-card[data-id]').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

/* ════════════════════════════════════════
   5. 타임스케줄 (오늘 / 내일 공용)
════════════════════════════════════════ */
// Builds an ISO 8601 datetime string from a lecture date + HH:MM + optional extra minutes.
// Handles overflow past midnight by advancing the date.
function buildOriginTime(date, timeHHMM, extraMin = 0) {
  const totalMin = timeToMin(timeHHMM) + extraMin;
  const dayOff   = Math.floor(totalMin / 1440);
  const minOfDay = totalMin % 1440;
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + dayOff);
  const h = String(Math.floor(minOfDay / 60)).padStart(2, '0');
  const m = String(minOfDay % 60).padStart(2, '0');
  return `${formatDateString(d)}T${h}:${m}:00`;
}

function getDeviceScheduler() {
  try {
    const d = JSON.parse(localStorage.getItem('kangbiseo_device') ?? 'null');
    return d?.scheduler ?? {};
  } catch { return {}; }
}

function getEffectiveBufferTime() {
  const s = getDeviceScheduler();
  if (s.bufferTime === 'custom') return Number(s.bufferCustom) || 30;
  return Number(s.bufferTime) || 30;
}

/* ════════════════════════════════════════
   타임라인 강의 카드 — 오늘/내일 공용
════════════════════════════════════════ */
function _createTimelineCard(lec, isDone) {
  const sliceStart  = _ts(lec);
  const sliceEnd    = _te(lec);
  const isMultiDay  = lec._isMultiDay ?? false;

  const color     = getLectureColor(lec);
  const bg        = hexToRgba(color, isDone ? 0.1 : 0.3);
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
   현재 시간 바 — DOM 기반 분 단위 정밀 위치
════════════════════════════════════════ */
function _injectNowBar(container, nowMin) {
  const now    = new Date();
  const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const bar = document.createElement('div');
  bar.className = 'tl-now-bar';
  bar.innerHTML = `<div class="tl-now-line"></div><span class="tl-now-label">현재 ${nowStr}</span>`;
  Object.assign(bar.style, {
    position: 'absolute', left: '0', right: '0', margin: '0',
    pointerEvents: 'none', zIndex: '10',
  });
  container.style.position = 'relative';
  container.appendChild(bar);

  requestAnimationFrame(() => {
    const items = [...container.querySelectorAll('.timeline-item[data-start-min]')];
    if (!items.length) { bar.style.top = '0px'; return; }

    const contTop = container.getBoundingClientRect().top;
    let topPx;

    // Case 1: nowMin falls inside a lecture item
    let withinEl = null, withinS = 0, withinE = 0;
    for (const el of items) {
      const s = Number(el.dataset.startMin), e = Number(el.dataset.endMin);
      if (s <= nowMin && nowMin < e) { withinEl = el; withinS = s; withinE = e; break; }
    }

    if (withinEl) {
      const r     = withinEl.getBoundingClientRect();
      const ratio = (nowMin - withinS) / (withinE - withinS);
      topPx = (r.top - contTop) + ratio * r.height;
    } else {
      // Case 2: nowMin is in a gap between lectures (or before/after all)
      let prevEl = null, prevE = -Infinity, nextEl = null, nextS = Infinity;
      for (const el of items) {
        const s = Number(el.dataset.startMin), e = Number(el.dataset.endMin);
        if (e <= nowMin && e > prevE) { prevEl = el; prevE = e; }
        if (s > nowMin && s < nextS)  { nextEl = el; nextS = s; }
      }

      if (!prevEl && nextEl) {
        topPx = nextEl.getBoundingClientRect().top - contTop - 18;
      } else if (prevEl && !nextEl) {
        topPx = prevEl.getBoundingClientRect().bottom - contTop + 4;
      } else if (prevEl && nextEl) {
        const pBot  = prevEl.getBoundingClientRect().bottom - contTop;
        const nTop  = nextEl.getBoundingClientRect().top    - contTop;
        const ratio = (nowMin - prevE) / (nextS - prevE);
        topPx = pBot + ratio * (nTop - pBot);
      } else {
        topPx = Math.max(0, items[0].getBoundingClientRect().top - contTop - 18);
      }
    }

    bar.style.top = `${Math.max(0, topPx)}px`;
  });
}

async function renderTimelineInto(containerId, lectures, showNowBar) {
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
  const originAddr  = sched.originAddress?.trim() || '';
  const hasOrigin   = !!originAddr;

  const firstLec = lectures[0];
  const lastLec  = lectures[lectures.length - 1];

  // Fetch all travel times in parallel: inter-lecture + home legs if needed
  // Inter-lecture: pass endTime + wrapupTime as originTime for time-aware routing
  const interLecPromises = lectures.slice(0, -1).map((lec, i) => {
    const wrapup     = Number(lec.wrapupTime ?? sched.wrapupTime ?? 15);
    const originTime = buildOriginTime(_td(lec), _te(lec), wrapup);
    return fetchTravelMin(lec.place, lectures[i + 1].place, originTime);
  });
  const homePromises = hasOrigin
    ? [fetchTravelMin(originAddr, firstLec.place), fetchTravelMin(lastLec.place, originAddr)]
    : [Promise.resolve(null), Promise.resolve(null)];

  const [travelMins, [travelToFirst, travelToHome]] = await Promise.all([
    Promise.all(interLecPromises),
    Promise.all(homePromises),
  ]);

  // Home-to-Home calculations
  const firstSetup  = Number(firstLec.setupTime  ?? sched.setupTime  ?? 20);
  const lastWrapup  = Number(lastLec.wrapupTime   ?? sched.wrapupTime ?? 15);
  // Round departure DOWN to nearest 10-min increment (07:06 → 07:00, 08:19 → 08:10)
  const departureMin = hasOrigin
    ? Math.floor((timeToMin(_ts(firstLec)) - (firstSetup + bufferTime + (travelToFirst ?? 0))) / 10) * 10
    : null;
  const returnMin = hasOrigin
    ? timeToMin(_te(lastLec)) + lastWrapup + (travelToHome ?? 0)
    : null;

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

// 1. 날짜 기준점 설정
const firstStartDate   = firstLec.startDate ?? firstLec.date ?? '';
const lastEndDate      = lastLec.endDate    ?? lastLec.date  ?? '';

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
          <div class="tl-card tl-card--home-origin">
            <div class="tl-card-title">🏠 출발</div>
            <div class="tl-card-sub">${escapeHtml(originAddr)}</div>
          </div>
        </div>
      </div>`);

    // Home → First lecture gap (이동/버퍼/준비 정보)
    const t2f = travelToFirst ?? 0;
    const totalMargin = t2f + bufferTime + firstSetup;
    parts.push(`
      <div class="tl-gap-row">
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
      const travelMin  = rawTravel ?? 0;
      const wrapup1    = Number(lec.wrapupTime  ?? sched.wrapupTime ?? 15);
      const setup2     = Number(next.setupTime  ?? sched.setupTime  ?? 20);
      const reqGap     = wrapup1 + travelMin + bufferTime + setup2;
      const actGap     = timeToMin(_ts(next)) - timeToMin(_te(lec));
      const arrivalMin = timeToMin(_te(lec)) + wrapup1 + travelMin;
      const depStr     = minToTime(timeToMin(_te(lec)) + wrapup1);
      const arrivalStr = minToTime(arrivalMin);
      const isWarn     = actGap < reqGap;
      const travelLabel = rawTravel == null
        ? '이동 시간 미확인'
        : `이동 ${travelMin}분 · 도착 예정 ${arrivalStr}`;

      parts.push(`
        <div class="tl-gap-row${isWarn ? ' tl-gap-row--warn' : ''}">
          <div class="tl-time-col">
            <div class="tl-time" style="font-size:9px;color:#9ca3af;">${depStr}</div>
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
    const t2h      = travelToHome ?? 0;
    const depStr   = minToTime(timeToMin(_te(lastLec)) + lastWrapup);
    const retStr   = minToTime(returnMin);

    parts.push(`
      <div class="tl-gap-row">
        <div class="tl-time-col">
          <div class="tl-time" style="font-size:9px;color:#9ca3af;">${depStr}</div>
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
            <div class="tl-card-title">🏠 귀가</div>
            <div class="tl-card-sub">${escapeHtml(originAddr)}</div>
          </div>
        </div>
      </div>`);
  }

  container.innerHTML = parts.join('');
  container.querySelectorAll('.tl-card--lecture[data-id]').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
  if (showNowBar) _injectNowBar(container, nowMin);
}

function renderTimeline()         { renderTimelineInto('timeline-list',          todayLectures,    true);  }
function renderTomorrowTimeline() { renderTimelineInto('tomorrow-timeline-list', tomorrowLectures, false); }

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
  const weekTotalFee = Object.values(dateToLectures).flat().reduce((s, l) => s + (Number(l.fee)||0), 0);
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

// Sidebar shows only overdue + today's incomplete todos, sorted oldest-first
function _sidebarTodos(all) {
  const today = getTodayString();
  return all
    .filter(t => !t.isDone && t.deadline <= today)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
}

function _renderSidebarTodos() {
  const listEl  = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  const visible = _sidebarTodos(todos);
  renderTodoList(listEl, visible, allLectures, getTopicTags());
  if (countEl) {
    const overdue = visible.filter(t => t.deadline < getTodayString()).length;
    const todayCount = visible.length - overdue;
    countEl.textContent = overdue > 0
      ? `오늘 ${todayCount}건 · 연체 ${overdue}건`
      : `오늘 ${todayCount}건`;
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
  await initLectureModal(() => ({ allLectures, currentUser }));
  renderGreeting();
  initLectures(user.uid);
  initTodos(user.uid);
}, {
  withModal: true,
  cleanupFn: () => { unsubscribeTodos?.(); unsubscribeLectures?.(); },
});
