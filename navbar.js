// js/pages/calendar.js — 강의 캘린더 (Firebase + FullCalendar)

import { auth, db } from '../api.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js';
import {
  collection, doc, query, where, onSnapshot, updateDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

/* ════════════════════════════════════════
   상수
════════════════════════════════════════ */
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const TODAY  = new Date();
TODAY.setHours(0, 0, 0, 0);
const IN_7DAYS = new Date(TODAY.getTime() + 7 * 24 * 60 * 60 * 1000);

/* ════════════════════════════════════════
   상태
════════════════════════════════════════ */
let calendar      = null;
let allLectures   = [];
let activeModalId = null;
let unsubLectures = null;

/* ════════════════════════════════════════
   유틸
════════════════════════════════════════ */
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════
   강의 상태 자동 분류 (lectures.js 동일 로직)
════════════════════════════════════════ */
function classifyStatus(lec) {
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
  urgent:   { label: '준비 임박', cls: 'lec-badge--urgent'    },
  upcoming: { label: '강의 예정', cls: 'lec-badge--scheduled' },
  doc:      { label: '서류 미비', cls: 'lec-badge--doc'       },
  unpaid:   { label: '미입금',   cls: 'lec-badge--unpaid'    },
  done:     { label: '완료',     cls: 'lec-badge--done'      },
};

/* ════════════════════════════════════════
   이벤트 색상 결정
   - 미입금(isPaid=false): 회색 — 미입금 상태 시각화 (최우선)
   - 준비 임박:            주황
   - 서류 미비:            노랑-주황
   - 완료:                 초록
   - 강의 예정:            파랑 (앱 포인트 색상)
════════════════════════════════════════ */
function getEventColor(lec) {
  if (!lec.isPaid) {
    return { bg: '#9ca3af', border: '#6b7280', text: '#1f2937' };
  }
  switch (classifyStatus(lec)) {
    case 'urgent':   return { bg: '#f59e0b', border: '#d97706', text: '#fff' };
    case 'doc':      return { bg: '#d97706', border: '#b45309', text: '#fff' };
    case 'done':     return { bg: '#059669', border: '#047857', text: '#fff' };
    default:         return { bg: '#0ea5e9', border: '#0284c7', text: '#fff' };
  }
}

/* ════════════════════════════════════════
   Firestore 데이터 → FullCalendar 이벤트 변환
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
        classNames:      lec.isPaid ? [] : ['unpaid-event'],
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
    initialView: 'dayGridMonth',
    locale:      'ko',
    height:      'auto',

    /* 헤더 툴바: 이전/다음/오늘 → FullCalendar 기본 제공
       뷰 전환은 별도 커스텀 버튼 사용                    */
    headerToolbar: {
      left:   'prev,next today',
      center: 'title',
      right:  '',
    },

    /* 주간 뷰 시간 범위 */
    slotMinTime:  '07:00:00',
    slotMaxTime:  '22:00:00',
    slotDuration: '00:30:00',
    allDaySlot:   false,
    nowIndicator: true,

    /* 빈 이벤트 메시지 */
    noEventsContent: '이번 달 등록된 강의가 없어요.',

    /* 이벤트 클릭 → 상세 모달 */
    eventClick: ({ event }) => openModal(event.id),

    /* 이벤트 렌더 후크: 네이티브 툴팁 */
    eventDidMount: ({ event, el: evEl }) => {
      const lec = event.extendedProps;
      const paidMark = lec.isPaid ? '' : '[미입금] ';
      evEl.setAttribute(
        'title',
        `${paidMark}${lec.title || ''}\n${lec.timeStart}~${lec.timeEnd}  ${lec.client || ''}`,
      );
    },

    /* 초기 이벤트 소스 (onSnapshot 연결 후 채움) */
    events: [],
  });

  calendar.render();
}

/* ════════════════════════════════════════
   캘린더 이벤트 갱신 (onSnapshot 호출 시)
════════════════════════════════════════ */
function updateCalendarEvents() {
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(toFcEvents(allLectures));
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

btnMonth?.addEventListener('click', () => {
  calendar?.changeView('dayGridMonth');
  setActiveViewBtn(btnMonth);
});

btnWeek?.addEventListener('click', () => {
  calendar?.changeView('timeGridWeek');
  setActiveViewBtn(btnWeek);
});

/* ════════════════════════════════════════
   강의 상세 모달
════════════════════════════════════════ */
const modalBackdrop   = document.getElementById('modal-backdrop');
const confirmBackdrop = document.getElementById('confirm-backdrop');

function openModal(id) {
  const lec = allLectures.find(l => l.id === id);
  if (!lec || !modalBackdrop) return;
  activeModalId = id;

  const status    = classifyStatus(lec);
  const meta      = STATUS_META[status] || { label: status, cls: '' };
  const d         = parseDate(lec.date);
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()} (${DAY_KO[d.getDay()]})`;

  /* 헤더 */
  document.getElementById('modal-title').textContent       = escapeHtml(lec.title);
  document.getElementById('modal-badge').className         = `lec-badge ${meta.cls}`;
  document.getElementById('modal-badge').textContent       = meta.label;
  document.getElementById('modal-date-meta').textContent   = `${dateLabel} · ${lec.timeStart}~${lec.timeEnd}`;
  document.getElementById('modal-client-meta').textContent = escapeHtml(lec.client || '—');

  /* 기본 정보 */
  document.getElementById('modal-place').textContent    = escapeHtml(lec.place || '—');
  document.getElementById('modal-time').textContent     = `${lec.timeStart} ~ ${lec.timeEnd}`;
  document.getElementById('modal-fee').textContent      = `₩${(Number(lec.fee) || 0).toLocaleString()}`;
  document.getElementById('modal-paiddate').textContent = lec.paidDate || '미정';

  const paidEl = document.getElementById('modal-paidstatus');
  paidEl.textContent = lec.isPaid ? '✅ 입금 확인' : '❌ 미입금';
  paidEl.className   = `modal-info-value${lec.isPaid ? '' : ' highlight'}`;

  const docEl = document.getElementById('modal-doc-status');
  docEl.textContent = lec.isDocumented ? '✅ 서류 제출 완료' : '❌ 서류 미제출';
  docEl.className   = `modal-info-value${lec.isDocumented ? '' : ' highlight'}`;

  /* 담당자 */
  const mgrName  = lec.managerName  || '—';
  const mgrPhone = lec.managerPhone || '';
  document.getElementById('modal-mgr-avatar').textContent = mgrName.charAt(0) || '담';
  document.getElementById('modal-mgr-name').textContent   = escapeHtml(mgrName);
  document.getElementById('modal-mgr-sub').textContent    = mgrPhone || '연락처 미등록';

  const phoneLink = document.getElementById('modal-mgr-phone');
  if (mgrPhone) {
    phoneLink.href                = `tel:${mgrPhone}`;
    phoneLink.style.opacity       = '';
    phoneLink.style.pointerEvents = '';
  } else {
    phoneLink.href                = '#';
    phoneLink.style.opacity       = '0.35';
    phoneLink.style.pointerEvents = 'none';
  }

  /* 메모 */
  document.getElementById('modal-memo').value = lec.memo || '';

  modalBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close-btn')?.focus();
}

function closeModal() {
  modalBackdrop?.classList.remove('open');
  document.body.style.overflow = '';
  activeModalId = null;
}

document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', e => {
  if (e.target === modalBackdrop) closeModal();
});

/* ── 메모 저장 ── */
document.getElementById('btn-modal-save')?.addEventListener('click', async () => {
  if (!activeModalId) return;
  const memo = document.getElementById('modal-memo').value;
  try {
    await updateDoc(doc(db, 'lectures', activeModalId), { memo });
    closeModal();
    window.showToast?.('메모가 저장되었습니다.', 'success');
  } catch (err) {
    console.error('[강비서] 메모 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다.', 'error');
  }
});

/* ── 삭제 컨펌 ── */
function closeConfirm() {
  confirmBackdrop?.classList.remove('open');
}

document.getElementById('btn-modal-delete')?.addEventListener('click', () => {
  confirmBackdrop?.classList.add('open');
});
document.getElementById('btn-confirm-cancel')?.addEventListener('click', closeConfirm);
confirmBackdrop?.addEventListener('click', e => {
  if (e.target === confirmBackdrop) closeConfirm();
});

document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
  if (!activeModalId) return;
  const id = activeModalId;
  closeConfirm();
  closeModal();
  try {
    await deleteDoc(doc(db, 'lectures', id));
    window.showToast?.('강의가 삭제되었습니다.', 'error');
  } catch (err) {
    console.error('[강비서] 강의 삭제 오류:', err);
    window.showToast?.('삭제에 실패했습니다.', 'error');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeConfirm();
  }
});

/* ════════════════════════════════════════
   사이드바 유저 정보 업데이트
════════════════════════════════════════ */
function updateSidebarUser(user) {
  const name     = user.displayName || '강사';
  const nameEl   = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl)   nameEl.textContent   = `${name} 강사`;
  if (avatarEl) avatarEl.textContent = name.charAt(0);
}

/* ════════════════════════════════════════
   로그아웃
════════════════════════════════════════ */
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  try {
    if (unsubLectures) unsubLectures();
    await signOut(auth);
    window.location.replace('../login.html');
  } catch (err) {
    console.error('[강비서] 로그아웃 오류:', err);
  }
});

/* ════════════════════════════════════════
   Firestore 실시간 구독 (onSnapshot)
════════════════════════════════════════ */
function initLectures(uid) {
  if (unsubLectures) unsubLectures();

  const q = query(
    collection(db, 'lectures'),
    where('uid', '==', uid),
  );

  unsubLectures = onSnapshot(q, snapshot => {
    /* 로딩 스피너 숨김 */
    document.getElementById('cal-loading')?.classList.add('hidden');

    allLectures = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateCalendarEvents();
  }, err => {
    console.error('[강비서] 강의 구독 오류:', err);
    document.getElementById('cal-loading')?.classList.add('hidden');
    window.showToast?.('강의 데이터를 불러오지 못했습니다.', 'error');
  });
}

/* ════════════════════════════════════════
   인증 상태 감지 — 권한 가드 & 진입점
════════════════════════════════════════ */
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.replace('../login.html');
    return;
  }
  updateSidebarUser(user);
  initCalendar();         // FullCalendar 마운트
  initLectures(user.uid); // Firestore 실시간 구독 시작
});
