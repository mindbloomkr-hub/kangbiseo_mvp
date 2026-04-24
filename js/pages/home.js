// js/pages/home.js — 홈 대시보드 (Firestore 실시간 연동)
// type="module" 로 로드됨

import { auth, db } from '../api.js';
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  collection, doc, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

/* ════════════════════════════════════════
   XSS 방지 유틸
════════════════════════════════════════ */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════
   [1] 강의별 고유 색상 팔레트 (ID 해시 기반)
════════════════════════════════════════ */
const LECTURE_COLORS = [
  '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#f97316', '#3b82f6', '#ef4444',
];

function getLectureColor(id) {
  if (!id) return LECTURE_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  return LECTURE_COLORS[Math.abs(hash) % LECTURE_COLORS.length];
}

/* ════════════════════════════════════════
   날짜 유틸
════════════════════════════════════════ */
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

const _TODAY = new Date();
_TODAY.setHours(0, 0, 0, 0);
const _IN_7DAYS = new Date(_TODAY.getTime() + 7 * 24 * 60 * 60 * 1000);

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

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

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateKo(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${DAY_KO[d.getDay()]})`;
}

function calcDuration(start, end) {
  if (!start || !end) return '—';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const total = (eh * 60 + em) - (sh * 60 + sm);
  if (total <= 0) return '—';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

/* ════════════════════════════════════════
   강의 상태 분류 + 메타
════════════════════════════════════════ */
const TAX_LABEL = {
  income3_3: '사업소득 3.3%',
  income8_8: '기타소득 8.8%',
  exempt:    '면세',
  other:     '기타',
};

const PROGRESS_LABEL = {
  discussing: '논의 중',
  scheduled:  '강의 예정',
  admin:      '행정 대기',
  done:       '진행 완료',
  cancelled:  '취소/드롭',
};

const STATUS_META = {
  discussing: { label: '논의 중',   cls: 'lec-badge--discussing' },
  urgent:     { label: '준비 임박', cls: 'lec-badge--urgent'     },
  upcoming:   { label: '강의 예정', cls: 'lec-badge--scheduled'  },
  admin:      { label: '행정 대기', cls: 'lec-badge--admin'      },
  done:       { label: '완료',      cls: 'lec-badge--done'       },
  unpaid:     { label: '미입금',    cls: 'lec-badge--unpaid'     },
  cancelled:  { label: '취소',      cls: 'lec-badge--cancelled'  },
};

function classifyStatus(lec) {
  const prog = lec.progressStatus || 'scheduled';
  if (prog === 'cancelled')  return 'cancelled';
  if (prog === 'done')       return 'done';
  if (prog === 'admin')      return 'admin';
  if (prog === 'discussing') return 'discussing';
  const d = parseDate(lec.date);
  if (d < _TODAY) return lec.isPaid ? 'done' : 'unpaid';
  if (d <= _IN_7DAYS) return 'urgent';
  return 'upcoming';
}

/* ════════════════════════════════════════
   전역 상태
════════════════════════════════════════ */
let currentUser          = null;
let todos                = [];
let allLectures          = [];
let todayLectures        = [];
let unsubscribeTodos     = null;
let unsubscribeLectures  = null;
let activeModalId        = null;
let editingLecId         = null;

/* ════════════════════════════════════════
   [10] 닉네임 우선 표시명
════════════════════════════════════════ */
function getDisplayName() {
  return localStorage.getItem('userNickname')
      || localStorage.getItem('userName')
      || '강사';
}

/* ════════════════════════════════════════
   1. 사이드바 유저 정보
════════════════════════════════════════ */
function updateSidebarUser() {
  const nameEl   = document.querySelector('.sidebar-user-name');
  const avatarEl = document.querySelector('.sidebar-avatar');
  if (!nameEl || !avatarEl) return;
  const name = getDisplayName();
  nameEl.textContent   = name + ' 강사';
  avatarEl.textContent = name.charAt(0);
}

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
   2. 환영 인사 (닉네임 우선)
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

  const name = getDisplayName();
  greetEl.innerHTML = `${emoji} ${name} 강사님, ${greet}!`;

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
    { icon: '📅', iconCls: 'stat-icon--blue',   value: `${todayLectures.length}건`,                             label: '오늘 강의',      delta: '' },
    { icon: '💰', iconCls: 'stat-icon--green',  value: totalFee > 0 ? `${(totalFee/10000).toFixed(0)}만원` : '—', label: '오늘 예상 수익', delta: '' },
    { icon: '⏱',  iconCls: 'stat-icon--yellow', value: todayLectures.length > 1 ? '이동 확인' : '—',              label: '이동 버퍼 타임', delta: '' },
    { icon: '💳', iconCls: 'stat-icon--red',    value: `${unpaidCnt}건`,                                         label: '미입금 정산',    delta: unpaidAmt > 0 ? `₩${unpaidAmt.toLocaleString()} 미수` : '' },
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
   [1] 색상 동기화  [2] 클릭 시 상세 모달 열기
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
    const color      = getLectureColor(l.id);
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
            <div class="briefing-meta-item"><span class="briefing-meta-icon">💰</span><span class="briefing-meta-text">₩${(Number(l.fee)||0).toLocaleString()}</span></div>
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

  /* [2] 클릭 이벤트 연결 */
  container.querySelectorAll('.lecture-briefing-card[data-id]').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

/* ════════════════════════════════════════
   5. 오늘의 타임스케줄
   [1] 강의별 고유 색상 적용
════════════════════════════════════════ */
function renderTimeline() {
  const container = document.getElementById('timeline-list');
  if (!container) return;

  if (todayLectures.length === 0) {
    container.innerHTML = `
      <div class="no-lecture-state" style="padding:var(--space-8) 0;">
        <div class="no-lecture-icon">📭</div>
        <p class="no-lecture-text">오늘 일정이 없어요.</p>
      </div>`;
    return;
  }

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  function timeToMin(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function nowBar() {
    return `
      <div style="display:flex;align-items:center;gap:12px;margin:12px 0 12px 90px;">
        <div style="border-top:2px dashed #2563c4;width:40px;"></div>
        <span style="color:#2563c4;font-weight:bold;font-size:0.85rem;">현재 ${nowStr}</span>
      </div>`;
  }

  let nowInserted = false;
  const html = todayLectures.map((lec, idx) => {
    const color    = getLectureColor(lec.id);
    const itemMin  = timeToMin(lec.timeStart);
    const nextMin  = todayLectures[idx + 1] ? timeToMin(todayLectures[idx + 1].timeStart) : Infinity;
    const isDone   = timeToMin(lec.timeEnd) < nowMin;

    const nodeStyle = isDone
      ? 'background:#9ca3af;border-color:#9ca3af;'
      : `background:${color};border-color:${color};`;
    const cardBorderStyle = isDone
      ? 'border-left:3px solid #9ca3af;opacity:0.7;'
      : `border-left:3px solid ${color};`;

    let barBefore = '';
    let barAfter  = '';

    if (idx === 0 && nowMin < itemMin) {
      nowInserted = true;
      barBefore = nowBar();
    } else if (!nowInserted && nowMin >= itemMin && nowMin < nextMin) {
      nowInserted = true;
      barAfter = nowBar();
    }

    return `
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
      ${barAfter}`;
  }).join('');

  container.innerHTML = html + (!nowInserted ? nowBar() : '');
}

/* ════════════════════════════════════════
   6. 이번 주 일정 (강의별 고유 색상)
════════════════════════════════════════ */
function renderWeekly() {
  const gridEl    = document.getElementById('weekly-day-grid');
  const summaryEl = document.getElementById('weekly-summary');
  if (!gridEl) return;

  const today      = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr   = getTodayString();
  const weekDates  = getWeekDateStrings();
  const DAY_ORDER  = [0, 1, 2, 3, 4, 5, 6];

  const dowToDateStr = {};
  weekDates.forEach(dateStr => {
    const d = new Date(dateStr);
    dowToDateStr[d.getDay()] = dateStr;
  });

  const dateToLectures = {};
  allLectures.forEach(lec => {
    if (weekDates.includes(lec.date)) {
      if (!dateToLectures[lec.date]) dateToLectures[lec.date] = [];
      dateToLectures[lec.date].push(lec);
    }
  });

  gridEl.innerHTML = DAY_ORDER.map(dow => {
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
          const color = getLectureColor(lec.id);
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

  /* [4] 이번 주 강의 카드 클릭 → 상세 모달 */
  gridEl.querySelectorAll('.week-lec-card[data-id]').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });

  const weekTotal    = Object.values(dateToLectures).flat().length;
  const weekTotalFee = Object.values(dateToLectures).flat().reduce((s, l) => s + (Number(l.fee)||0), 0);
  const daysWithLec  = Object.keys(dateToLectures).length;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="weekly-summary-item"><span>📋</span><span>이번 주 강의</span><span class="weekly-summary-value">${weekTotal}건</span></div>
      <div class="weekly-summary-item"><span>💰</span><span>예상 수익</span><span class="weekly-summary-value">₩${(weekTotalFee/10000).toFixed(0)}만원</span></div>
      <div class="weekly-summary-item"><span>🚗</span><span>강의 있는 날</span><span class="weekly-summary-value">${daysWithLec}일</span></div>`;
  }
}

/* ════════════════════════════════════════
   7. 강의 Firestore 실시간 구독
════════════════════════════════════════ */
function initLectures(uid) {
  if (unsubscribeLectures) unsubscribeLectures();

  const q = query(collection(db, 'lectures'), where('uid', '==', uid));
  unsubscribeLectures = onSnapshot(q, snapshot => {
    allLectures = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const todayStr = getTodayString();
    todayLectures  = allLectures
      .filter(l => l.date === todayStr)
      .sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''));

    renderGreeting();
    renderStatBar();
    renderBriefingCards();
    renderTimeline();
    renderWeekly();
    updateNavBadge();
  }, err => {
    console.error('[강비서] 강의 구독 오류:', err);
  });
}

/* ════════════════════════════════════════
   [2] 통합 강의 모달 — 뷰 패널 채우기
════════════════════════════════════════ */
function populateView(lec) {
  if (!lec) return;
  const status = classifyStatus(lec);
  const meta   = STATUS_META[status] || { label: status, cls: '' };
  const full   = formatDateKo(lec.date);

  document.getElementById('modal-title').textContent       = lec.title || '(제목 없음)';
  document.getElementById('modal-badge').className         = `lec-badge ${meta.cls}`;
  document.getElementById('modal-badge').textContent       = meta.label;
  document.getElementById('modal-date-meta').textContent   = `${full} · ${lec.timeStart}~${lec.timeEnd}`;
  document.getElementById('modal-client-meta').textContent = lec.client || '—';

  document.getElementById('v-date').textContent           = full;
  document.getElementById('v-time').textContent           = `${lec.timeStart} ~ ${lec.timeEnd}`;
  document.getElementById('v-total-duration').textContent = calcDuration(lec.timeStart, lec.timeEnd);
  document.getElementById('v-title').textContent          = lec.title  || '—';
  document.getElementById('v-client').textContent         = lec.client || '—';
  document.getElementById('v-fee').textContent            = `₩${(Number(lec.fee) || 0).toLocaleString()}`;

  document.getElementById('v-session-current').textContent = lec.sessionCurrent ? `${lec.sessionCurrent}회` : '—';
  document.getElementById('v-session-total').textContent   = lec.sessionTotal   ? `${lec.sessionTotal}회`   : '—';
  document.getElementById('v-participants').textContent    = lec.participants    ? `${lec.participants}명`   : '—';
  document.getElementById('v-group-info').textContent      = lec.groupInfo      || '—';
  document.getElementById('v-topic').textContent           = lec.topic          || '—';
  document.getElementById('v-supplies').textContent        = lec.supplies       || '—';
  document.getElementById('v-place').textContent           = lec.place          || '—';
  document.getElementById('v-parking').textContent         = lec.parkingInfo    || '—';

  const mgrName  = lec.managerName  || '';
  const mgrPhone = lec.managerPhone || '';
  const mgrEmail = lec.managerEmail || '';

  document.getElementById('v-mgr-avatar').textContent         = mgrName ? mgrName.charAt(0) : '담';
  document.getElementById('v-mgr-name').textContent           = mgrName  || '담당자 미등록';
  document.getElementById('v-mgr-sub').textContent            = mgrPhone || '연락처 미등록';
  document.getElementById('v-mgr-email-text').textContent     = mgrEmail || '—';

  const phoneLink = document.getElementById('v-mgr-phone');
  if (mgrPhone) { phoneLink.href = `tel:${mgrPhone}`;     phoneLink.style.opacity = ''; phoneLink.style.pointerEvents = ''; }
  else          { phoneLink.href = '#'; phoneLink.style.opacity = '0.35'; phoneLink.style.pointerEvents = 'none'; }

  const emailLink = document.getElementById('v-mgr-email-link');
  if (mgrEmail) { emailLink.href = `mailto:${mgrEmail}`; emailLink.style.opacity = ''; emailLink.style.pointerEvents = ''; }
  else          { emailLink.href = '#'; emailLink.style.opacity = '0.35'; emailLink.style.pointerEvents = 'none'; }

  document.getElementById('v-progress').textContent    = PROGRESS_LABEL[lec.progressStatus || 'scheduled'] || '—';
  const paidEl = document.getElementById('v-paid-status');
  paidEl.textContent = lec.isPaid ? '✅ 입금 완료' : '❌ 미입금';
  paidEl.className   = `modal-info-value paid-badge${lec.isPaid ? ' paid-badge--paid' : ' paid-badge--unpaid'}`;
  document.getElementById('v-payment-date').textContent = lec.paymentDate || '미정';
  document.getElementById('v-tax').textContent          = TAX_LABEL[lec.taxType] || '—';

  const memoEl = document.getElementById('v-memo');
  if (lec.memo) { memoEl.textContent = lec.memo; memoEl.classList.remove('is-empty'); }
  else          { memoEl.textContent = '메모 없음'; memoEl.classList.add('is-empty'); }
}

function populateForm(lec) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  set('af-date',            lec.date);
  set('af-title',           lec.title);
  set('af-client',          lec.client);
  set('af-fee',             lec.fee);
  set('af-session-current', lec.sessionCurrent);
  set('af-session-total',   lec.sessionTotal);
  set('af-participants',    lec.participants);
  set('af-group-info',      lec.groupInfo);
  set('af-topic',           lec.topic);
  set('af-supplies',        lec.supplies);
  set('af-place',           lec.place);
  set('af-parking',         lec.parkingInfo);
  set('af-manager-name',    lec.managerName);
  set('af-manager-phone',   lec.managerPhone);
  set('af-manager-email',   lec.managerEmail);
  set('af-progress',        lec.progressStatus || 'scheduled');
  set('af-payment-date',    lec.paymentDate);
  set('af-memo',            lec.memo);

  const startSel = document.getElementById('af-time-start');
  if (startSel) {
    startSel.innerHTML = buildTimeOptions();
    startSel.value     = lec.timeStart || '';
    syncEndTimeOptions(lec.timeEnd || '');
  }
  updateDurationDisplay();

  const paidSel = document.getElementById('af-paid-status');
  if (paidSel) paidSel.value = lec.isPaid ? 'true' : 'false';

  const taxSel = document.getElementById('af-tax');
  if (taxSel) taxSel.value = lec.taxType || 'income3_3';
}

/* ════════════════════════════════════════
   모달 모드 전환
════════════════════════════════════════ */
function switchMode(mode) {
  const viewPanel    = document.getElementById('view-panel');
  const formPanel    = document.getElementById('form-panel');
  const viewFooter   = document.getElementById('view-footer');
  const formFooter   = document.getElementById('form-footer');
  const metaRow      = document.getElementById('modal-meta-row');
  const formSubtitle = document.getElementById('modal-form-subtitle');

  const isView = (mode === 'view');
  if (viewPanel)    viewPanel.style.display    = isView ? '' : 'none';
  if (formPanel)    formPanel.style.display    = isView ? 'none' : '';
  if (viewFooter)   viewFooter.style.display   = isView ? 'flex' : 'none';
  if (formFooter)   formFooter.style.display   = isView ? 'none' : 'flex';
  if (metaRow)      metaRow.style.display      = isView ? '' : 'none';
  if (formSubtitle) formSubtitle.style.display = isView ? 'none' : '';
}

/* ════════════════════════════════════════
   모달 열기 / 닫기
════════════════════════════════════════ */
const modalBackdrop   = document.getElementById('modal-backdrop');
const confirmBackdrop = document.getElementById('confirm-backdrop');

function openModal(id) {
  const lec = allLectures.find(l => l.id === id);
  if (!lec || !modalBackdrop) return;
  activeModalId = id;
  editingLecId  = null;

  populateView(lec);
  switchMode('view');

  modalBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close-btn')?.focus();
}

function closeModal() {
  modalBackdrop?.classList.remove('open');
  document.body.style.overflow = '';
  activeModalId = null;
  editingLecId  = null;
}

document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', e => {
  if (e.target !== modalBackdrop) return;
  closeModal();
});

/* 수정하기 */
document.getElementById('btn-modal-edit')?.addEventListener('click', () => {
  if (!activeModalId) return;
  const lec = allLectures.find(l => l.id === activeModalId);
  if (!lec) return;
  editingLecId = activeModalId;
  document.getElementById('modal-title').textContent = '강의 수정';
  const sub = document.getElementById('modal-form-subtitle');
  if (sub) sub.textContent = '강의 정보를 수정하세요.';
  initTimeSelects();
  populateForm(lec);
  switchMode('form');
  document.getElementById('af-title')?.focus();
});

/* 폼 취소 */
document.getElementById('btn-form-cancel')?.addEventListener('click', () => {
  if (editingLecId) {
    const id = activeModalId;
    editingLecId = null;
    const lec = allLectures.find(l => l.id === id);
    if (lec) { populateView(lec); switchMode('view'); }
    else closeModal();
  } else {
    closeModal();
  }
});

/* 폼 저장 */
document.getElementById('btn-form-submit')?.addEventListener('click', async () => {
  const get = id => document.getElementById(id)?.value?.trim() ?? '';
  const date      = get('af-date');
  const timeStart = get('af-time-start');
  const timeEnd   = get('af-time-end');
  const title     = get('af-title');
  const client    = get('af-client');
  const feeRaw    = get('af-fee');

  if (!date || !timeStart || !timeEnd || !title || !client || !feeRaw) {
    window.showToast?.('날짜, 시간, 강의명, 고객사, 강사료는 필수 입력 항목이에요.', 'error');
    return;
  }
  if (timeEnd <= timeStart) {
    window.showToast?.('종료 시간은 시작 시간보다 이후여야 합니다.', 'error');
    return;
  }

  const submitBtn = document.getElementById('btn-form-submit');
  submitBtn.disabled    = true;
  submitBtn.textContent = '저장 중...';

  const isPaid  = document.getElementById('af-paid-status')?.value === 'true';
  const taxType = document.getElementById('af-tax')?.value || 'income3_3';

  const payload = {
    date, timeStart, timeEnd, title, client,
    fee:            Number(feeRaw),
    sessionCurrent: Number(get('af-session-current')) || null,
    sessionTotal:   Number(get('af-session-total'))   || null,
    participants:   Number(get('af-participants'))     || null,
    groupInfo:      get('af-group-info'),
    topic:          get('af-topic'),
    supplies:       get('af-supplies'),
    place:          get('af-place'),
    parkingInfo:    get('af-parking'),
    managerName:    get('af-manager-name'),
    managerPhone:   get('af-manager-phone'),
    managerEmail:   get('af-manager-email'),
    progressStatus: get('af-progress') || 'scheduled',
    isPaid,
    paymentDate:    get('af-payment-date'),
    taxType,
    memo:           get('af-memo'),
  };

  try {
    if (editingLecId) {
      await updateDoc(doc(db, 'lectures', editingLecId), payload);
      window.showToast?.('강의가 수정되었습니다.', 'success');
      const idx = allLectures.findIndex(l => l.id === editingLecId);
      if (idx >= 0) {
        allLectures[idx] = { ...allLectures[idx], ...payload };
        activeModalId = editingLecId;
        editingLecId  = null;
        populateView(allLectures[idx]);
        switchMode('view');
      } else {
        closeModal();
      }
    } else {
      if (!currentUser) return;
      await addDoc(collection(db, 'lectures'), {
        uid: currentUser.uid, ...payload, isDocumented: false, createdAt: serverTimestamp(),
      });
      window.showToast?.('강의가 등록되었습니다.', 'success');
      closeModal();
    }
  } catch (err) {
    console.error('[강비서] 강의 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다.', 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = '저장하기';
  }
});

/* 삭제 컨펌 */
function closeConfirm() { confirmBackdrop?.classList.remove('open'); }

document.getElementById('btn-modal-delete')?.addEventListener('click', () => {
  confirmBackdrop?.classList.add('open');
});
document.getElementById('btn-confirm-cancel')?.addEventListener('click', closeConfirm);
confirmBackdrop?.addEventListener('click', e => { if (e.target === confirmBackdrop) closeConfirm(); });

document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
  if (!activeModalId) return;
  const id = activeModalId;
  closeConfirm(); closeModal();
  try {
    await deleteDoc(doc(db, 'lectures', id));
    window.showToast?.('강의가 삭제되었습니다.', 'error');
  } catch (err) {
    console.error('[강비서] 강의 삭제 오류:', err);
    window.showToast?.('삭제에 실패했습니다.', 'error');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); }
});

/* ════════════════════════════════════════
   시간 선택 유틸 (폼 수정 모드용)
════════════════════════════════════════ */
function buildTimeOptions(minAfter = '') {
  const opts = ['<option value="">시간 선택</option>'];
  for (let h = 7; h <= 22; h++) {
    for (let m = 0; m < 60; m += 10) {
      if (h === 22 && m > 0) break;
      const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      if (!minAfter || t > minAfter) opts.push(`<option value="${t}">${t}</option>`);
    }
  }
  return opts.join('');
}

function syncEndTimeOptions(keepValue = '') {
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (!startSel || !endSel) return;
  const prev = keepValue || endSel.value;
  endSel.innerHTML = buildTimeOptions(startSel.value);
  if (prev) endSel.value = prev;
  updateDurationDisplay();
}

function updateDurationDisplay() {
  const start = document.getElementById('af-time-start')?.value;
  const end   = document.getElementById('af-time-end')?.value;
  const el    = document.getElementById('af-duration-computed');
  if (el) el.value = (start && end) ? calcDuration(start, end) : '';
}

function initTimeSelects() {
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (startSel) startSel.innerHTML = buildTimeOptions();
  if (endSel)   endSel.innerHTML   = buildTimeOptions();
  startSel?.addEventListener('change', () => syncEndTimeOptions());
  endSel?.addEventListener('change',   updateDurationDisplay);
}

/* ════════════════════════════════════════
   [8] 알림 벨 아이콘 — 드롭다운 피드백
════════════════════════════════════════ */
(function initNotificationBell() {
  const bell = document.querySelector('.topbar-notification');
  if (!bell) return;

  const dropdown = document.createElement('div');
  dropdown.id = 'notification-dropdown';
  Object.assign(dropdown.style, {
    display:      'none',
    position:     'absolute',
    top:          'calc(100% + 8px)',
    right:        '0',
    width:        '280px',
    background:   '#fff',
    border:       '1px solid #e5e7eb',
    borderRadius: '10px',
    boxShadow:    '0 8px 24px rgba(0,0,0,.12)',
    zIndex:       '9999',
    padding:      '0',
    overflow:     'hidden',
  });
  dropdown.innerHTML = `
    <div style="padding:12px 16px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;font-size:0.9rem;">
      🔔 알림
    </div>
    <div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:0.85rem;">
      새로운 알림이 없습니다.
    </div>`;

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
    if (e.key === 'Escape')                 { isOpen = false; dropdown.style.display = 'none'; }
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
    btn.addEventListener('click', e => {
      e.stopPropagation();
      todoDelete(btn.closest('.todo-item').dataset.id);
    });
  });
}

function initTodos(uid) {
  if (unsubscribeTodos) unsubscribeTodos();

  const q = query(collection(db, 'todos'), where('uid', '==', uid));
  unsubscribeTodos = onSnapshot(q, snapshot => {
    todos = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return aMs - bMs;
      });
    renderTodoList();
  }, err => {
    console.error('[강비서] Todo 구독 오류:', err);
  });
}

async function todoAdd() {
  const input = document.getElementById('todo-input');
  const text  = input?.value.trim();
  if (!text || !currentUser) return;
  try {
    await addDoc(collection(db, 'todos'), {
      uid: currentUser.uid, text, isDone: false, createdAt: serverTimestamp(),
    });
    input.value = '';
  } catch (err) {
    console.error('[강비서] Todo 추가 오류:', err);
  }
}

async function todoToggle(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  try {
    await updateDoc(doc(db, 'todos', id), { isDone: !todo.isDone });
  } catch (err) {
    console.error('[강비서] Todo 토글 오류:', err);
  }
}

async function todoDelete(id) {
  try {
    await deleteDoc(doc(db, 'todos', id));
  } catch (err) {
    console.error('[강비서] Todo 삭제 오류:', err);
  }
}

async function todoClearDone() {
  const done = todos.filter(t => t.isDone);
  if (done.length === 0) return;
  try {
    await Promise.all(done.map(t => deleteDoc(doc(db, 'todos', t.id))));
  } catch (err) {
    console.error('[강비서] 완료 항목 삭제 오류:', err);
  }
}

/* ════════════════════════════════════════
   이벤트 바인딩
════════════════════════════════════════ */
document.getElementById('todo-add-btn')?.addEventListener('click', todoAdd);
document.getElementById('todo-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') todoAdd();
});
document.getElementById('todo-clear-done')?.addEventListener('click', todoClearDone);

document.getElementById('logout-btn')?.addEventListener('click', async e => {
  e.preventDefault();
  try {
    if (unsubscribeTodos)    unsubscribeTodos();
    if (unsubscribeLectures) unsubscribeLectures();
    await signOut(auth);
    localStorage.removeItem('userName');
    localStorage.removeItem('userNickname');
    localStorage.removeItem('userUid');
    localStorage.removeItem('userEmail');
    window.location.replace('../login.html');
  } catch (err) {
    console.error('[강비서] 로그아웃 오류:', err);
  }
});

/* ════════════════════════════════════════
   초기 렌더 (빈 상태 — 데이터 로딩 전)
════════════════════════════════════════ */
renderGreeting();
renderStatBar();
renderBriefingCards();
renderTimeline();
renderWeekly();
renderTodoList();

/* ════════════════════════════════════════
   인증 상태 감지 — 권한 가드 + 구독 시작
════════════════════════════════════════ */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace('../login.html');
    return;
  }

  currentUser = user;
  localStorage.setItem('userName',  user.displayName || '강사');
  localStorage.setItem('userUid',   user.uid);
  localStorage.setItem('userEmail', user.email || '');

  /* [10] Firestore에서 닉네임 로드 */
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const nickname = snap.data().nickname || '';
      if (nickname) localStorage.setItem('userNickname', nickname);
      else          localStorage.removeItem('userNickname');
    }
  } catch (err) {
    console.error('[강비서] 닉네임 로드 오류:', err);
  }

  updateSidebarUser();
  renderGreeting();

  initLectures(user.uid);
  initTodos(user.uid);
});
