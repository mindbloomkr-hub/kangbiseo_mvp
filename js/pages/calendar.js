// js/pages/calendar.js — 강의 캘린더 (Firebase + FullCalendar)

import { subscribeLectures, authGuard } from '../api.js';
import {
  TODAY, IN_7DAYS,
  STATUS_META as STATUS_META_BASE,
  parseDate, getTodayString,
} from '../utils.js';
import { initLectureModal, openModal } from '../components/lectureModal.js';

/* ════════════════════════════════════════
   calendar.js 전용 확장
   — doc(서류 미비) 상태 추가 → classifyStatus + STATUS_META 로컬 오버라이드
════════════════════════════════════════ */
function classifyStatus(lec) {
  const prog = lec.progressStatus || 'scheduled';
  if (prog === 'cancelled')  return 'cancelled';
  if (prog === 'done')       return 'done';
  if (prog === 'admin')      return 'admin';
  if (prog === 'discussing') return 'discussing';

  const d = parseDate(lec.date);
  if (d < TODAY) {
    if (!lec.isPaid)       return 'unpaid';
    if (!lec.isDocumented) return 'doc';
    return 'done';
  }
  if (d <= IN_7DAYS) return 'urgent';
  return 'upcoming';
}

const STATUS_META = {
  ...STATUS_META_BASE,
  doc: { label: '서류 미비', cls: 'lec-badge--doc' },
};

/* ════════════════════════════════════════
   상태
════════════════════════════════════════ */
let calendar      = null;
let currentUser   = null;
let allLectures   = [];
let unsubLectures = null;

/* ════════════════════════════════════════
   이벤트 색상 — 투트랙 (progressStatus + isPaid)
════════════════════════════════════════ */
function getEventColor(lec) {
  const prog = lec.progressStatus || 'scheduled';
  const d    = parseDate(lec.date);

  if (prog === 'cancelled') return { bg: '#f9fafb', border: '#d1d5db', text: '#9ca3af' };
  if (prog === 'done')      return lec.isPaid
    ? { bg: '#059669', border: '#047857', text: '#fff' }
    : { bg: '#e5e7eb', border: '#9ca3af', text: '#ef4444' };
  if (prog === 'admin')     return { bg: '#d1fae5', border: '#6ee7b7', text: '#b91c1c' };
  if (prog === 'discussing') return { bg: '#ede9fe', border: '#a78bfa', text: '#5b21b6' };

  if (d < TODAY) {
    return lec.isPaid
      ? { bg: '#9ca3af', border: '#6b7280', text: '#fff' }
      : { bg: '#e5e7eb', border: '#9ca3af', text: '#ef4444' };
  }
  if (d <= IN_7DAYS) return { bg: '#f59e0b', border: '#d97706', text: '#fff' };
  return { bg: '#0ea5e9', border: '#0284c7', text: '#fff' };
}

/* ════════════════════════════════════════
   주간 뷰 동적 시간 범위 계산
════════════════════════════════════════ */
function calcDynamicSlotRange(lectures) {
  let minH = 7;
  let maxH = 21;

  lectures.forEach(lec => {
    if (lec.timeStart) {
      const h = parseInt(lec.timeStart.split(':')[0], 10);
      if (h < minH) minH = h;
    }
    if (lec.timeEnd) {
      const [h, m] = lec.timeEnd.split(':').map(Number);
      const endH = m > 0 ? h + 1 : h;
      if (endH > maxH) maxH = endH;
    }
  });

  return {
    slotMinTime: `${String(Math.max(0,  minH)).padStart(2, '0')}:00:00`,
    slotMaxTime: `${String(Math.min(24, maxH)).padStart(2, '0')}:00:00`,
  };
}

/* ════════════════════════════════════════
   Firestore 데이터 → FullCalendar 이벤트
════════════════════════════════════════ */
function toFcEvents(lectures) {
  return lectures
    .filter(lec => lec.date && lec.timeStart && lec.timeEnd)
    .map(lec => {
      const { bg, border, text } = getEventColor(lec);
      return {
        id:              lec.id,
        title:           lec.title || '(제목 없음)',
        start:           `${lec.date}T${lec.timeStart}:00`,
        end:             `${lec.date}T${lec.timeEnd}:00`,
        backgroundColor: bg,
        borderColor:     border,
        textColor:       text,
        classNames:      (lec.progressStatus || '') === 'cancelled' ? ['fc-cancelled-lec'] : [],
        extendedProps:   lec,
      };
    });
}

/* ════════════════════════════════════════
   FullCalendar 초기화
════════════════════════════════════════ */
function initCalendar() {
  const el = document.getElementById('calendar');
  if (!el || !window.FullCalendar) {
    console.error('[강비서] FullCalendar를 찾을 수 없습니다.');
    return;
  }

  calendar = new window.FullCalendar.Calendar(el, {
    initialView:     'dayGridMonth',
    locale:          'ko',
    height:          'auto',
    headerToolbar:   { left: 'prev,next today', center: 'title', right: '' },
    slotMinTime:     '07:00:00',
    slotMaxTime:     '21:00:00',
    slotDuration:    '00:30:00',
    allDaySlot:      false,
    nowIndicator:    true,
    noEventsContent: '이번 달 등록된 강의가 없어요.',
    eventDisplay:    'block',

    eventClick: ({ event }) => openModal(event.id),

    eventDidMount: ({ event, el: evEl }) => {
      const lec  = event.extendedProps;
      const prog = lec.progressStatus || 'scheduled';

      const paidMark   = lec.isPaid ? '' : '[미입금] ';
      const statusHint = prog === 'cancelled' ? '[취소] ' : '';
      evEl.setAttribute('title',
        `${statusHint}${paidMark}${lec.title || ''}\n${lec.timeStart}~${lec.timeEnd}  ${lec.client || ''}`
      );

      if (prog === 'cancelled') {
        evEl.style.opacity = '0.6';
        evEl.style.borderStyle = 'dashed';
        const titleEl = evEl.querySelector('.fc-event-title, .fc-list-event-title');
        if (titleEl) titleEl.style.textDecoration = 'line-through';
      }
      if (prog === 'admin') {
        evEl.style.borderLeft = '3px solid #b91c1c';
      }
      if ((prog === 'done' || (parseDate(lec.date) < TODAY && prog === 'scheduled')) && !lec.isPaid) {
        evEl.style.borderLeft = '3px solid #ef4444';
      }
    },

    events: [],
  });

  calendar.render();
}

function updateCalendarEvents() {
  if (!calendar) return;
  const { slotMinTime, slotMaxTime } = calcDynamicSlotRange(allLectures);
  calendar.setOption('slotMinTime', slotMinTime);
  calendar.setOption('slotMaxTime', slotMaxTime);
  calendar.removeAllEvents();
  calendar.addEventSource(toFcEvents(allLectures));
}

/* ════════════════════════════════════════
   nav-badge 업데이트
════════════════════════════════════════ */
function updateNavBadge() {
  const count = allLectures.filter(l => l.date >= getTodayString()).length;
  localStorage.setItem('navBadgeCount', String(count));
  const badgeEl = document.getElementById('nav-badge-lectures');
  if (!badgeEl) return;
  badgeEl.textContent   = count;
  badgeEl.style.display = count > 0 ? '' : 'none';
}

/* ════════════════════════════════════════
   뷰 전환 버튼
════════════════════════════════════════ */
const btnMonth = document.getElementById('btn-month-view');
const btnWeek  = document.getElementById('btn-week-view');

function setActiveViewBtn(active) {
  [btnMonth, btnWeek].forEach(btn => {
    if (!btn) return;
    const isActive = btn === active;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

btnMonth?.addEventListener('click', () => { calendar?.changeView('dayGridMonth'); setActiveViewBtn(btnMonth); });
btnWeek?.addEventListener('click',  () => { calendar?.changeView('timeGridWeek');  setActiveViewBtn(btnWeek);  });

/* ════════════════════════════════════════
   Firestore 실시간 구독
════════════════════════════════════════ */
function initLectures(uid) {
  if (unsubLectures) unsubLectures();
  unsubLectures = subscribeLectures(uid, snapshot => {
    document.getElementById('cal-loading')?.classList.add('hidden');
    allLectures = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateCalendarEvents();
    updateNavBadge();
  }, err => {
    console.error('[강비서] 강의 구독 오류:', err);
    document.getElementById('cal-loading')?.classList.add('hidden');
    window.showToast?.('강의 데이터를 불러오지 못했습니다.', 'error');
  });
}

/* ════════════════════════════════════════
   인증 상태 감지
════════════════════════════════════════ */
authGuard(user => {
  currentUser = user;
  initCalendar();
  initLectures(user.uid);
  initLectureModal(
    () => ({ allLectures, currentUser }),
    { classifyStatus, statusMeta: STATUS_META }
  );
}, {
  withModal: true,
  cleanupFn: () => unsubLectures?.(),
});
