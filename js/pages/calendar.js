// js/pages/calendar.js — 강의 캘린더 (Firebase + FullCalendar)

import { subscribeLectures, authGuard } from '../api.js';
import {
  TODAY, IN_7DAYS,
  STATUS_META as STATUS_META_BASE,
  parseDate, getTodayString, calcFee,
} from '../utils.js';
import { initLectureModal, openModal, getTopicTags } from '../components/lectureModal.js';
import { initMultiSessionModal, openAddModal as openMultiSessionModal } from '../components/multiSessionModal.js';

(function prepareBridge() {
  const checkInterval = setInterval(() => {
    // db와 addDoc 등 필수 변수가 파일 내에서 정의되었는지 확인
    if (typeof db !== 'undefined' && typeof addDoc !== 'undefined') {
      window._temp_db = db;
      window._temp_collection = collection;
      window._temp_addDoc = addDoc;
      window._temp_serverTimestamp = serverTimestamp;
      console.log('[강비서] Firebase 통로 연결 완료!');
      clearInterval(checkInterval); // 연결 성공 시 감시 중단
    }
  }, 100); // 0.1초마다 확인
})();


/* ════════════════════════════════════════
   멀티데이 CSS — 1회 주입
════════════════════════════════════════ */
(function _injectMultiDayCSS() {
  if (document.getElementById('fc-multiday-styles')) return;
  const s = document.createElement('style');
  s.id = 'fc-multiday-styles';
  s.textContent = [
    /* Remove default radius so segments look like a continuous bar */
    '.fc-multiday-lec.fc-daygrid-event{border-radius:0!important}',
    '.fc-multiday-lec.fc-daygrid-event.fc-event-start{border-top-left-radius:4px!important;border-bottom-left-radius:4px!important}',
    '.fc-multiday-lec.fc-daygrid-event.fc-event-end{border-top-right-radius:4px!important;border-bottom-right-radius:4px!important}',
    /* Intermediate segments: hide left border so bar looks seamless */
    '.fc-multiday-lec.fc-daygrid-event:not(.fc-event-start){border-left:none!important}',
  ].join('');
  document.head.appendChild(s);
})();

/* ════════════════════════════════════════
   진행 상태별 CSS — 1회 주입
════════════════════════════════════════ */
(function _injectStatusCSS() {
  if (document.getElementById('fc-status-styles')) return;
  const s = document.createElement('style');
  s.id = 'fc-status-styles';
  s.textContent = [
    /* discussing — dashed border */
    '.cal-event--discussing{border-style:dashed!important}',
    /* onhold — dimmed */
    '.cal-event--onhold{opacity:.65!important}',
    /* cancelled — dimmed + dashed + strikethrough title */
    '.cal-event--cancelled{opacity:.5!important;border-style:dashed!important}',
    '.cal-event--cancelled .fc-event-title,',
    '.cal-event--cancelled .fc-list-event-title{text-decoration:line-through!important}',
  ].join('');
  document.head.appendChild(s);
})();

/* ════════════════════════════════════════
   calendar.js 전용 확장
   — doc(서류 미비) 상태 추가 → classifyStatus + STATUS_META 로컬 오버라이드
════════════════════════════════════════ */
function classifyStatus(lec) {
  const prog = lec.progressStatus || 'scheduled';

  // Priority 1: cancelled always wins
  if (prog === 'cancelled') return 'cancelled';

  const d = parseDate(lec.startDate != null ? lec.startDate : lec.date);

  // Priority 2: unpaid alert — skip if no fee (na)
  if (!lec.isPaid && calcFee(lec) > 0 && (d < TODAY || prog === 'done')) return 'unpaid';

  // Priority 3: urgent alert — scheduled within 7 days
  if (prog === 'scheduled' && d >= TODAY && d <= IN_7DAYS) return 'urgent';

  // Calendar-specific: past scheduled lectures — check documentation status
  if (prog === 'scheduled' && d < TODAY) {
    return lec.isDocumented ? 'done' : 'doc';
  }

  return prog; // discussing | scheduled | done | onhold
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
  const d    = parseDate(lec.startDate != null ? lec.startDate : lec.date);

  if (prog === 'cancelled')  return { bg: '#f9fafb', border: '#d1d5db', text: '#9ca3af' };
  if (prog === 'onhold')     return { bg: '#f3f4f6', border: '#9ca3af', text: '#6b7280' };
  if (prog === 'discussing') return { bg: '#ede9fe', border: '#a78bfa', text: '#5b21b6' };
  if (prog === 'needs_review') return { bg: '#fbee03', border: '#fbee03', text: '#108500' };

  // na-fee: no payment tracking — display with tag/scheduled color regardless of progress
  if (!lec.isPaid && !calcFee(lec)) {
    const _tagNa = lec.topicTagId != null ? getTopicTags().find(t => t.id === lec.topicTagId) : null;
    if (_tagNa?.color) return { bg: _tagNa.color, border: _tagNa.color, text: '#fff' };
    return { bg: '#0ea5e9', border: '#0284c7', text: '#fff' };
  }

  if (prog === 'done')       return lec.isPaid
    ? { bg: '#059669', border: '#047857', text: '#fff' }
    : { bg: '#96efc1', border: '#9ca3af', text: '#ef4444' };

  // scheduled (past)
  if (d < TODAY) {
    return lec.isPaid
      ? { bg: '#9ca3af', border: '#6b7280', text: '#fff' }
      : { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' };
  }

  // scheduled (future) — topicTag color takes priority
  const _tag = lec.topicTagId != null ? getTopicTags().find(t => t.id === lec.topicTagId) : null;
  if (_tag?.color) return { bg: _tag.color, border: _tag.color, text: '#fff' };
  if (d <= IN_7DAYS) return { bg: '#f59e0b', border: '#d97706', text: '#fff' };
  return { bg: '#0ea5e9', border: '#0284c7', text: '#fff' };
}

/* ════════════════════════════════════════
   주간 뷰 슬롯 최소 시간 동적 조정
   — 표시 중인 주(week)에 09:00 이전 강의가 있으면
     해당 시(hour) 정각부터 달력을 확장한다.
   — 다회차(멀티데이) 강의는 스캔에서 제외.
════════════════════════════════════════ */
const SLOT_MIN_DEFAULT = '09:00:00';

function applyWeekSlotMin() {
  if (!calendar) return;

  // Month view doesn't use slotMinTime — reset to default and exit
  if (calendar.view.type !== 'timeGridWeek') {
    calendar.setOption('slotMinTime', SLOT_MIN_DEFAULT);
    return;
  }

  const rangeStart = calendar.view.activeStart.toISOString().slice(0, 10);
  const rangeEnd   = calendar.view.activeEnd.toISOString().slice(0, 10);
  let minH = 9;

  allLectures.forEach(lec => {
    const startDate = (lec.startDate != null ? lec.startDate : (lec.date != null ? lec.date : ''));
    const endDate   = (lec.endDate   != null ? lec.endDate   : (lec.date != null ? lec.date : ''));
    if (startDate !== endDate) return;                            // skip multi-day
    if (startDate < rangeStart || startDate >= rangeEnd) return; // outside visible week
    const timeStart = (lec.startTime != null ? lec.startTime : (lec.timeStart != null ? lec.timeStart : ''));
    if (!timeStart) return;
    const h = parseInt(timeStart.split(':')[0], 10);
    if (h < minH) minH = h;
  });

  calendar.setOption('slotMinTime', minH < 9
    ? `${String(Math.max(0, minH)).padStart(2, '0')}:00:00`
    : SLOT_MIN_DEFAULT
  );
}

/* ════════════════════════════════════════
   Firestore 데이터 → FullCalendar 이벤트
════════════════════════════════════════ */
function toFcEvents(lectures) {
  return lectures
    .filter(lec => {
      const startDate = (lec.startDate != null ? lec.startDate : lec.date);
      const timeStart = (lec.startTime != null ? lec.startTime : lec.timeStart);
      const timeEnd   = (lec.endTime   != null ? lec.endTime   : lec.timeEnd);
      return startDate && timeStart && timeEnd;
    })
    .map(lec => {
      const startDate  = (lec.startDate != null ? lec.startDate : lec.date);
      const endDate    = (lec.endDate   != null ? lec.endDate   : lec.date);
      const timeStart  = (lec.startTime != null ? lec.startTime : lec.timeStart);
      const timeEnd    = (lec.endTime   != null ? lec.endTime   : lec.timeEnd);
      const isMultiDay = startDate !== endDate;
      const prog = lec.progressStatus || 'scheduled';
      const { bg, border, text } = getEventColor(lec);
      const classNames = [];
      if (prog === 'discussing') classNames.push('cal-event--discussing');
      if (prog === 'onhold')     classNames.push('cal-event--onhold');
      if (prog === 'cancelled')  classNames.push('cal-event--cancelled');
      if (isMultiDay)            classNames.push('fc-multiday-lec');
      return {
        id:              lec.id,
        title:           lec.title || '(제목 없음)',
        start:           `${startDate}T${timeStart}:00`,
        end:             `${endDate}T${timeEnd}:00`,
        backgroundColor: bg,
        borderColor:     border,
        textColor:       text,
        classNames,
        extendedProps: {
          ...lec,
          _startDate:  startDate,
          _endDate:    endDate,
          _timeStart:  timeStart,
          _timeEnd:    timeEnd,
          _isMultiDay: isMultiDay,
        },
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
    slotMinTime:     SLOT_MIN_DEFAULT,
    slotMaxTime:     '21:00:00',
    slotDuration:    '00:30:00',
    allDaySlot:      false,
    nowIndicator:    true,
    noEventsContent: '이번 달 등록된 강의가 없어요.',
    eventDisplay:    'block',
    displayEventTime: false,

    eventContent: (arg) => {
      const lec        = arg.event.extendedProps;
      const prog       = lec.progressStatus || 'scheduled';
      const t          = (lec._timeStart != null ? lec._timeStart : (lec.timeStart != null ? lec.timeStart : ''));
      const isMultiDay = (lec._isMultiDay != null ? lec._isMultiDay : false);
      const isMobile   = window.matchMedia('(max-width: 768px)').matches;
      const fmt        = isMobile ? t.trim().split(':')[0] : t.slice(0, 5);
      const title      = arg.event.title;

      const STATUS_ICONS = { discussing: '💬', onhold: '⏸', cancelled: '🚫' };
      const icon = STATUS_ICONS[prog];

      let text;
      if (icon) {
        // Status-priority: icon + optional multiday marker + title (no time prefix)
        text = `${icon}${isMultiDay ? ' 🌙' : ''} ${title}`;
      } else if (isMultiDay && !arg.isStart) {
        text = `🌙 ${title}`;
      } else if (isMultiDay) {
        text = `${fmt} 🌙 ${title}`;
      } else {
        text = `${fmt} ${title}`;
      }

      const el = document.createElement('span');
      el.className   = 'fc-event-title';
      el.textContent = text;
      return { domNodes: [el] };
    },

    datesSet: () => applyWeekSlotMin(),

    eventClick: ({ event }) => openModal(event.id),

    eventDidMount: ({ event, el: evEl }) => {
      const lec  = event.extendedProps;
      const prog = lec.progressStatus || 'scheduled';

      const timeStart  = (lec._timeStart != null ? lec._timeStart : (lec.timeStart != null ? lec.timeStart : ''));
      const timeEnd    = (lec._timeEnd   != null ? lec._timeEnd   : (lec.timeEnd   != null ? lec.timeEnd   : ''));
      const startDate  = (lec._startDate != null ? lec._startDate : (lec.date      != null ? lec.date      : ''));
      const endDate    = (lec._endDate   != null ? lec._endDate   : (lec.date      != null ? lec.date      : ''));
      const isMultiDay = (lec._isMultiDay != null ? lec._isMultiDay : false);
      const timeRange  = isMultiDay
        ? `${startDate} ${timeStart} ~ ${endDate} ${timeEnd}`
        : `${timeStart}~${timeEnd}`;

      const naFee = !calcFee(lec);
      const STATUS_HINTS = { discussing: '[논의 중] ', onhold: '[보류 중] ', cancelled: '[취소/드롭] ' };
      const paidMark   = (lec.isPaid || naFee) ? '' : '[미입금] ';
      const statusHint = STATUS_HINTS[prog] || '';
      evEl.setAttribute('title',
        `${statusHint}${paidMark}${lec.title || ''}\n${timeRange}  ${lec.client || ''}`
      );

      // Visual effects for discussing/onhold/cancelled are handled by CSS classes.
      // Unpaid red border applies only to scheduled/done events (status events have their own identity).
      // Skip for na-fee lectures — they have no payment obligation.
      const isStatusEvent = prog === 'discussing' || prog === 'onhold' || prog === 'cancelled';
      if (!isStatusEvent && !lec.isPaid && !naFee && (parseDate(startDate) < TODAY || prog === 'done')) {
        evEl.style.borderLeft = '3px solid #ef4444';
      }
    },

    events: [],
  });

  calendar.render();
}

function updateCalendarEvents() {
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(toFcEvents(allLectures));
  applyWeekSlotMin();
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
function _renderLegendTags() {
  const container = document.getElementById('cal-legend-tags');
  if (!container) return;
  const tags = getTopicTags();
  if (!tags || tags.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = tags.map(t =>
    `<span class="cal-legend-tag" style="background:${t.color || '#64748b'};color:#fff;padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-right:4px;">${t.name}</span>`
  ).join('');
}

authGuard(async user => {
  currentUser = user;
  initCalendar();
  initLectures(user.uid);
  await initLectureModal(
    () => ({ allLectures, currentUser }),
    { classifyStatus, statusMeta: STATUS_META }
  );
  initMultiSessionModal(() => ({ allLectures, currentUser }));
  _renderLegendTags();

  document.getElementById('btn-multi-lecture')?.addEventListener('click', () => {
    const selectedDate = calendar
      ? calendar.getDate().toISOString().slice(0, 10)
      : null;
    openMultiSessionModal(selectedDate);
  });
}, {
  withModal: true,
  cleanupFn: () => unsubLectures?.(),
});

/* ════════════════════════════════════════
   ICS 임포트 수신기 (localStorage 브릿지)
   ics-import.html 에서 저장된 temp_lectures 를
   페이지 로드(F5) 시 Firebase 에 일괄 저장한다.

   setTimeout 500ms: authGuard / allLectures 초기화가
   완료된 이후 실행을 보장하기 위한 TDZ 방어막.
════════════════════════════════════════ */

// calendar.js 맨 하단
(function persistentImport() {
    const runImport = async () => {
        const raw = localStorage.getItem('temp_lectures');
        if (!raw) return;

        console.log('[강비서] 📬 임시 데이터 발견! 모든 준비가 끝날 때까지 감시를 시작합니다.');

        // 인증과 도구가 모두 준비될 때까지 무한 반복 (setInterval)
        const masterInterval = setInterval(async () => {
        // 1. 모든 수단과 방법을 동원해 유저 객체 탐색
        const user = 
            window.auth?.currentUser || 
            (typeof auth !== 'undefined' ? auth.currentUser : null) ||
            (window.firebase?.auth?.().currentUser) ||
            (window._auth?.currentUser); // 혹시 다른 이름으로 저장했을 경우

        const tools = window._temp_db && window._temp_addDoc;

        if (user && tools) {
            clearInterval(masterInterval);
            console.log('[강비서] ✅ 드디어 유저와 도구를 모두 찾았습니다!');

                try {
                    const { _temp_db, _temp_collection, _temp_addDoc, _temp_serverTimestamp } = window;
                    const importedData = JSON.parse(raw);

                    for (const data of importedData) {
                        await _temp_addDoc(_temp_collection(_temp_db, 'lectures'), {
                            uid: user.uid,
                            ...data,
                            isDocumented: false,
                            createdAt: _temp_serverTimestamp(),
                        });
                    }

                    localStorage.removeItem('temp_lectures');
                    console.log('[강비서] 🎉 DB 저장 대성공!');
                    
                    if (window.showToast) {
                        window.showToast(`${importedData.length}건의 강의가 등록되었습니다.`, 'success');
                    }
                    
                    // 캘린더 화면 갱신을 위해 새로고침
                    setTimeout(() => location.reload(), 1200);
                } catch (err) {
                    console.error('[강비서] ❌ DB 저장 중 에러:', err);
                }
            } else {
                // 아직 준비 안 됨 - 상태를 5초마다 한 번씩 콘솔에 찍어줌 (디버깅용)
                if (Date.now() % 5000 < 100) {
                    console.log(`[강비서] 대기 중... (User: ${!!user}, Tools: ${!!tools})`);
                }
            }
        }, 300); // 0.3초 간격으로 체크
    };

    // 초기 로딩 지연을 고려해 2초 후 실행 시작
    setTimeout(runImport, 2000);
})();

(function finalAttempt() {
    const runImport = async (user) => {
    const raw = localStorage.getItem('temp_lectures');
    const tools = window._temp_db && window._temp_addDoc && window.updateDoc;
    
    if (!raw || !user || !tools) return;

    try {
        const { _temp_db, _temp_collection, _temp_addDoc, _temp_serverTimestamp, updateDoc, doc } = window;
        const importedData = JSON.parse(raw);
        
        // 중복 실행 방지를 위해 즉시 로컬스토리지 비우기 (중요)
        localStorage.removeItem('temp_lectures');

        for (const data of importedData) {
            const docRef = await _temp_addDoc(_temp_collection(_temp_db, 'lectures'), {
                uid: user.uid,
                ...data,
                isDocumented: false,
                createdAt: _temp_serverTimestamp(),
                _status: 'needs_review'
            });

            await updateDoc(doc(_temp_db, 'lectures', docRef.id), {
                id: docRef.id
            });
        }

        // ✅ 저장이 끝난 후 "강제 새로고침"으로 데이터 반영
        window.showToast?.(`${importedData.length}건 등록 완료!`, 'success');
        setTimeout(() => {
            location.replace(location.href); // 현재 페이지 강제 리로드
        }, 1000);

    } catch (e) {
        console.error('[강비서] 연동 에러:', e);
    }
};

    const targetAuth = window.auth || (typeof auth !== 'undefined' ? auth : null);

    if (targetAuth) {
        targetAuth.onAuthStateChanged((user) => {
            if (user) {
                const checkTools = setInterval(() => {
                    // updateDoc까지 준비되었는지 확인
                    if (window._temp_db && window.updateDoc) {
                        clearInterval(checkTools);
                        runImport(user);
                    }
                }, 500);
            }
        });
    }
})();