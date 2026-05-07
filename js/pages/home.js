// js/pages/home.js — 홈 대시보드 (Firestore 실시간 연동)
import { db, subscribeLectures, authGuard } from '../api.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { DAY_KO, escapeHtml, getTodayString, fetchTravelMin } from '../utils.js';
import { initLectureModal, openModal, getTopicTags } from '../components/lectureModal.js';

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
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
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
   3. 상단 통계 카드
════════════════════════════════════════ */
function renderStatBar() {
  const container = document.getElementById('stat-bar');
  if (!container) return;

  const totalFee  = todayLectures.reduce((sum, l) => sum + (Number(l.fee) || 0), 0);
  const now0      = new Date(); now0.setHours(0,0,0,0);
  const unpaidCnt = allLectures.filter(l => {
    const d = new Date(l.date); d.setHours(0,0,0,0);
    return !l.isPaid && d < now0;
  }).length;
  const unpaidAmt = allLectures
    .filter(l => { const d = new Date(l.date); d.setHours(0,0,0,0); return !l.isPaid && d < now0; })
    .reduce((s, l) => s + (Number(l.fee) || 0), 0);

  const stats = [
    { icon: '📅', iconCls: 'stat-icon--blue',   value: `${todayLectures.length}건`,                               label: '오늘 강의',      delta: '' },
    { icon: '💰', iconCls: 'stat-icon--green',  value: totalFee > 0 ? `${(totalFee).toFixed(0)}만원` : '—',       label: '오늘 예상 수익', delta: '' },
    { icon: '⏱',  iconCls: 'stat-icon--yellow', value: todayLectures.length > 1 ? '이동 확인' : '—',               label: '이동 버퍼 타임', delta: '' },
    { icon: '💳', iconCls: 'stat-icon--red',    value: `${unpaidCnt}건`,                                          label: '미입금 정산',    delta: unpaidAmt > 0 ? `₩${unpaidAmt.toLocaleString()} 미수` : '' },
  ];

  container.innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-icon ${s.iconCls}">${s.icon}</div>
      <div class="stat-body">
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
        ${s.delta ? `<div class="stat-delta stat-delta--down">${s.delta}</div>` : ''}
      </div>
    </div>
  `).join('');
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

  container.innerHTML = todayLectures.map((l) => {
    const color      = getLectureColor(l);
    const mgrInitial = (l.managerName || '담').charAt(0);
    return `
      <div class="lecture-briefing-card" data-id="${escapeHtml(l.id)}"
           style="cursor:pointer;position:relative;border-left:4px solid ${color};">
        <div class="briefing-body" style="padding-left:8px;">
          <div class="briefing-row-top">
            <span class="briefing-time">${l.timeStart} – ${l.timeEnd}</span>
            <span class="status-chip status-chip--scheduled">예정</span>
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
function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function _minToStr(min) {
  const total = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Builds an ISO 8601 datetime string from a lecture date + HH:MM + optional extra minutes.
// Handles overflow past midnight by advancing the date.
function buildOriginTime(date, timeHHMM, extraMin = 0) {
  const totalMin = timeToMin(timeHHMM) + extraMin;
  const dayOff   = Math.floor(totalMin / 1440);
  const minOfDay = totalMin % 1440;
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + dayOff);
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const h  = String(Math.floor(minOfDay / 60)).padStart(2, '0');
  const m  = String(minOfDay % 60).padStart(2, '0');
  return `${ds}T${h}:${m}:00`;
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
    const originTime = buildOriginTime(lec.date, lec.timeEnd, wrapup);
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
    ? Math.floor((timeToMin(firstLec.timeStart) - (firstSetup + bufferTime + (travelToFirst ?? 0))) / 10) * 10
    : null;
  const returnMin = hasOrigin
    ? timeToMin(lastLec.timeEnd) + lastWrapup + (travelToHome ?? 0)
    : null;

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const nowBar = () => `
    <div style="display:flex;align-items:center;gap:12px;margin:12px 0 12px 90px;">
      <div style="border-top:2px dashed #2563c4;width:40px;"></div>
      <span style="color:#2563c4;font-weight:bold;font-size:0.85rem;">현재 ${nowStr}</span>
    </div>`;

  let nowInserted = false;
  const parts = [];

  // ── Home departure node ──────────────────────────────
  if (hasOrigin) {
    const depStr = _minToStr(departureMin);
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

    // Home → First lecture gap
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
    const lec      = lectures[idx];
    const color    = getLectureColor(lec);
    const itemMin  = timeToMin(lec.timeStart);
    const nextMin  = lectures[idx + 1] ? timeToMin(lectures[idx + 1].timeStart) : Infinity;
    const isDone   = showNowBar && timeToMin(lec.timeEnd) < nowMin;

    const nodeStyle       = isDone ? 'background:#9ca3af;border-color:#9ca3af;' : `background:${color};border-color:${color};`;
    const cardBorderStyle = isDone ? 'border-left:3px solid #9ca3af;opacity:0.7;' : `border-left:3px solid ${color};`;

    let barBefore = '';
    let barAfter  = '';
    if (showNowBar) {
      if (idx === 0 && nowMin < itemMin) {
        nowInserted = true; barBefore = nowBar();
      } else if (!nowInserted && nowMin >= itemMin && nowMin < nextMin) {
        nowInserted = true; barAfter = nowBar();
      }
    }

    parts.push(`
      ${barBefore}
      <div class="timeline-item">
        <div class="tl-time-col"><div class="tl-time">${lec.timeStart}</div></div>
        <div class="tl-track"><div class="tl-node" style="${nodeStyle}"></div></div>
        <div class="tl-content">
          <div class="tl-card ${isDone ? 'tl-card--done' : 'tl-card--lecture'}" style="${cardBorderStyle}">
            <div class="tl-card-title">${escapeHtml(lec.title)}</div>
            <div class="tl-card-sub">${escapeHtml(lec.place || lec.client)} · ${lec.timeStart}~${lec.timeEnd}</div>
          </div>
        </div>
      </div>
      ${barAfter}`);

    // Gap row between consecutive lectures
    if (idx < lectures.length - 1) {
      const next       = lectures[idx + 1];
      const rawTravel  = travelMins[idx];
      const travelMin  = rawTravel ?? 0;
      const wrapup1    = Number(lec.wrapupTime  ?? sched.wrapupTime ?? 15);
      const setup2     = Number(next.setupTime  ?? sched.setupTime  ?? 20);
      const reqGap     = wrapup1 + travelMin + bufferTime + setup2;
      const actGap     = timeToMin(next.timeStart) - timeToMin(lec.timeEnd);
      const arrivalMin = timeToMin(lec.timeEnd) + wrapup1 + travelMin;
      const depStr     = _minToStr(timeToMin(lec.timeEnd) + wrapup1);
      const arrivalStr = _minToStr(arrivalMin);
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
  if (hasOrigin) {
    const t2h      = travelToHome ?? 0;
    const depStr   = _minToStr(timeToMin(lastLec.timeEnd) + lastWrapup);
    const retStr   = _minToStr(returnMin);

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

  container.innerHTML = parts.join('') + (showNowBar && !nowInserted ? nowBar() : '');
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
    const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth()+1).padStart(2,'0')}-${String(tomorrowObj.getDate()).padStart(2,'0')}`;

    todayLectures    = allLectures
      .filter(l => l.date === todayStr)
      .sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''));
    tomorrowLectures = allLectures
      .filter(l => l.date === tomorrowStr)
      .sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''));

    renderGreeting();
    renderStatBar();
    renderBriefingCards();
    renderTimeline();
    renderTomorrowTimeline();
    renderWeekly();
    updateNavBadge();
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
   To-do List — Firestore 실시간 연동
════════════════════════════════════════ */
function renderTodoList() {
  const list    = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  if (!list) return;

  if (todos.length === 0) {
    list.innerHTML = `<div class="todo-empty">등록된 할 일이 없어요 ✓</div>`;
  } else {
    list.innerHTML = todos.map(todo => `
      <div class="todo-item ${todo.isDone ? 'done' : ''}" data-id="${todo.id}">
        <div class="todo-checkbox ${todo.isDone ? 'checked' : ''}"
          role="checkbox" aria-checked="${todo.isDone}" tabindex="0">
          ${todo.isDone ? '✓' : ''}
        </div>
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        <button class="todo-delete-btn" aria-label="삭제">✕</button>
      </div>
    `).join('');
  }

  const doneCount = todos.filter(t => t.isDone).length;
  if (countEl) countEl.textContent = `완료 ${doneCount} / 전체 ${todos.length}`;

  list.querySelectorAll('.todo-checkbox').forEach(cb => {
    const getId = () => cb.closest('.todo-item').dataset.id;
    cb.addEventListener('click',   () => todoToggle(getId()));
    cb.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); todoToggle(getId()); }
    });
  });
  list.querySelectorAll('.todo-text').forEach(txt => {
    txt.addEventListener('click', () => todoToggle(txt.closest('.todo-item').dataset.id));
  });
  list.querySelectorAll('.todo-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); todoDelete(btn.closest('.todo-item').dataset.id); });
  });
}

function initTodos(uid) {
  if (unsubscribeTodos) unsubscribeTodos();
  const q = query(collection(db, 'todos'), where('uid', '==', uid));
  unsubscribeTodos = onSnapshot(q, snapshot => {
    todos = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    renderTodoList();
  }, err => { console.error('[강비서] Todo 구독 오류:', err); });
}

async function todoAdd() {
  const input = document.getElementById('todo-input');
  const text  = input?.value.trim();
  if (!text || !currentUser) return;
  try {
    await addDoc(collection(db, 'todos'), { uid: currentUser.uid, text, isDone: false, createdAt: serverTimestamp() });
    input.value = '';
  } catch (err) { console.error('[강비서] Todo 추가 오류:', err); }
}

async function todoToggle(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  try { await updateDoc(doc(db, 'todos', id), { isDone: !todo.isDone }); }
  catch (err) { console.error('[강비서] Todo 토글 오류:', err); }
}

async function todoDelete(id) {
  try { await deleteDoc(doc(db, 'todos', id)); }
  catch (err) { console.error('[강비서] Todo 삭제 오류:', err); }
}

async function todoClearDone() {
  const done = todos.filter(t => t.isDone);
  if (done.length === 0) return;
  try { await Promise.all(done.map(t => deleteDoc(doc(db, 'todos', t.id)))); }
  catch (err) { console.error('[강비서] 완료 항목 삭제 오류:', err); }
}

/* ════════════════════════════════════════
   이벤트 바인딩
════════════════════════════════════════ */
document.getElementById('todo-add-btn')?.addEventListener('click', todoAdd);
document.getElementById('todo-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') todoAdd(); });
document.getElementById('todo-clear-done')?.addEventListener('click', todoClearDone);

/* ════════════════════════════════════════
   초기 렌더 (빈 상태 — 데이터 로딩 전)
════════════════════════════════════════ */
renderGreeting();
renderStatBar();
renderBriefingCards();
renderTimeline();
renderTomorrowTimeline();
renderWeekly();
renderTodoList();

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
