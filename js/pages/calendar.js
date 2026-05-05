// js/pages/calendar.js — 강의 캘린더 (Firebase + FullCalendar)

import { subscribeLectures, authGuard } from '../api.js';
import {
  TODAY, IN_7DAYS,
  STATUS_META as STATUS_META_BASE,
  parseDate, getTodayString,
} from '../utils.js';
import { initLectureModal, openModal } from '../components/lectureModal.js';

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
   calendar.js 전용 확장
   — doc(서류 미비) 상태 추가 → classifyStatus + STATUS_META 로컬 오버라이드
════════════════════════════════════════ */
function classifyStatus(lec) {
  const prog = lec.progressStatus || 'scheduled';

  // Priority 1: cancelled always wins
  if (prog === 'cancelled') return 'cancelled';

  const d = parseDate(lec.date);

  // Priority 2: unpaid alert
  if (!lec.isPaid && (d < TODAY || prog === 'done')) return 'unpaid';

  // Priority 3: urgent alert — scheduled lecture within 7 days
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
  const d    = parseDate(lec.date);

  if (prog === 'cancelled')  return { bg: '#f9fafb', border: '#d1d5db', text: '#9ca3af' };
  if (prog === 'onhold')     return { bg: '#f3f4f6', border: '#9ca3af', text: '#6b7280' };
  if (prog === 'discussing') return { bg: '#ede9fe', border: '#a78bfa', text: '#5b21b6' };
  if (prog === 'needs_review') return { bg: '#fbee03', border: '#fbee03', text: '#108500' };
  if (prog === 'done')       return lec.isPaid
    ? { bg: '#059669', border: '#047857', text: '#fff' }
    : { bg: '#96efc1', border: '#9ca3af', text: '#ef4444' };

  // scheduled (past or future)
  if (d < TODAY) {
    return lec.isPaid
      ? { bg: '#9ca3af', border: '#6b7280', text: '#fff' }
      : { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' };
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
    displayEventTime: false,

    eventContent: (arg) => {
      const t   = arg.event.extendedProps.timeStart || '';
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const fmt = isMobile ? t.trim().split(':')[0] : t.slice(0, 5);
      const el  = document.createElement('span');
      el.className   = 'fc-event-title';
      el.textContent = `${fmt} ${arg.event.title}`;
      return { domNodes: [el] };
    },

    eventClick: ({ event }) => openModal(event.id),

    eventDidMount: ({ event, el: evEl }) => {
      const lec  = event.extendedProps;
      const prog = lec.progressStatus || 'scheduled';

      const paidMark   = lec.isPaid ? '' : '[미입금] ';
      const statusHint = prog === 'cancelled' ? '[취소/드롭] ' : '';
      evEl.setAttribute('title',
        `${statusHint}${paidMark}${lec.title || ''}\n${lec.timeStart}~${lec.timeEnd}  ${lec.client || ''}`
      );

      if (prog === 'cancelled') {
        evEl.style.opacity = '0.6';
        evEl.style.borderStyle = 'dashed';
        const titleEl = evEl.querySelector('.fc-event-title, .fc-list-event-title');
        if (titleEl) titleEl.style.textDecoration = 'line-through';
      }
      if (prog === 'onhold') {
        evEl.style.opacity = '0.7';
      }
      if (!lec.isPaid && (parseDate(lec.date) < TODAY || prog === 'done')) {
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