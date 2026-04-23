// js/pages/calendar.js — 강의 캘린더 (Firebase + FullCalendar)

import { auth, db } from '../api.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp,
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
let calendar        = null;
let currentUser     = null;
let allLectures     = [];
let activeModalId   = null;
let editingLecId    = null;   // null=추가모드, string=수정모드
let unsubLectures   = null;

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

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

/* ════════════════════════════════════════
   강의 상태 자동 분류
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

    headerToolbar: {
      left:   'prev,next today',
      center: 'title',
      right:  '',
    },

    slotMinTime:  '07:00:00',
    slotMaxTime:  '22:00:00',
    slotDuration: '00:30:00',
    allDaySlot:   false,
    nowIndicator: true,

    noEventsContent: '이번 달 등록된 강의가 없어요.',

    /* 이벤트 클릭 → 상세 모달 */
    eventClick: ({ event }) => openModal(event.id),

    eventDidMount: ({ event, el: evEl }) => {
      const lec = event.extendedProps;
      const paidMark = lec.isPaid ? '' : '[미입금] ';
      evEl.setAttribute(
        'title',
        `${paidMark}${lec.title || ''}\n${lec.timeStart}~${lec.timeEnd}  ${lec.client || ''}`,
      );
    },

    events: [],
  });

  calendar.render();
}

/* ════════════════════════════════════════
   캘린더 이벤트 갱신
════════════════════════════════════════ */
function updateCalendarEvents() {
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(toFcEvents(allLectures));
}

/* ════════════════════════════════════════
   nav-badge 업데이트
════════════════════════════════════════ */
function updateNavBadge() {
  const count = allLectures.filter(l => l.date >= todayString()).length;
  localStorage.setItem('navBadgeCount', String(count));
  const badgeEl = document.getElementById('nav-badge-lectures');
  if (!badgeEl) return;
  badgeEl.textContent = count;
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

btnMonth?.addEventListener('click', () => {
  calendar?.changeView('dayGridMonth');
  setActiveViewBtn(btnMonth);
});

btnWeek?.addEventListener('click', () => {
  calendar?.changeView('timeGridWeek');
  setActiveViewBtn(btnWeek);
});

/* ════════════════════════════════════════
   강의 상세 모달 (읽기 전용 + 수정·삭제 진입)
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

  document.getElementById('modal-title').textContent       = escapeHtml(lec.title);
  document.getElementById('modal-badge').className         = `lec-badge ${meta.cls}`;
  document.getElementById('modal-badge').textContent       = meta.label;
  document.getElementById('modal-date-meta').textContent   = `${dateLabel} · ${lec.timeStart}~${lec.timeEnd}`;
  document.getElementById('modal-client-meta').textContent = escapeHtml(lec.client || '—');

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

/* ── 수정 버튼 → 수정 모달 열기 ── */
document.getElementById('btn-modal-edit')?.addEventListener('click', () => {
  const id = activeModalId;
  closeModal();
  openEditModal(id);
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

/* ════════════════════════════════════════
   강의 추가 / 수정 통합 모달
════════════════════════════════════════ */
const addModalBackdrop = document.getElementById('add-modal-backdrop');

function openAddModal() {
  editingLecId = null;
  document.getElementById('add-modal-title').textContent = '강의 추가';
  document.getElementById('add-lecture-form')?.reset();
  const now = new Date();
  const af = document.getElementById('af-date');
  if (af) af.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  addModalBackdrop?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openEditModal(id) {
  const lec = allLectures.find(l => l.id === id);
  if (!lec) return;
  editingLecId = id;
  document.getElementById('add-modal-title').textContent = '강의 수정';

  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
  set('af-date',          lec.date);
  set('af-time-start',    lec.timeStart);
  set('af-time-end',      lec.timeEnd);
  set('af-title',         lec.title);
  set('af-client',        lec.client);
  set('af-fee',           lec.fee);
  set('af-place',         lec.place);
  set('af-manager-name',  lec.managerName);
  set('af-manager-phone', lec.managerPhone);
  set('af-memo',          lec.memo);

  addModalBackdrop?.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('af-title')?.focus();
}

function closeAddModal() {
  addModalBackdrop?.classList.remove('open');
  document.body.style.overflow = '';
  editingLecId = null;
}

document.getElementById('btn-add-lecture')?.addEventListener('click', openAddModal);
document.getElementById('add-modal-close')?.addEventListener('click', closeAddModal);
document.getElementById('add-modal-cancel')?.addEventListener('click', closeAddModal);
addModalBackdrop?.addEventListener('click', e => {
  if (e.target === addModalBackdrop) closeAddModal();
});

/* ── 추가/수정 저장 ── */
document.getElementById('add-modal-submit')?.addEventListener('click', async () => {
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

  const submitBtn = document.getElementById('add-modal-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = '저장 중...';

  const payload = {
    date,
    timeStart,
    timeEnd,
    title,
    client,
    place:        get('af-place'),
    fee:          Number(feeRaw),
    managerName:  get('af-manager-name'),
    managerPhone: get('af-manager-phone'),
    memo:         get('af-memo'),
  };

  try {
    if (editingLecId) {
      await updateDoc(doc(db, 'lectures', editingLecId), payload);
      window.showToast?.('강의가 수정되었습니다.', 'success');
    } else {
      if (!currentUser) return;
      await addDoc(collection(db, 'lectures'), {
        uid:          currentUser.uid,
        ...payload,
        isPaid:       false,
        isDocumented: false,
        createdAt:    serverTimestamp(),
      });
      window.showToast?.('강의가 등록되었습니다.', 'success');
    }
    closeAddModal();
  } catch (err) {
    console.error('[강비서] 강의 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '저장하기';
  }
});

/* ── ESC 키 ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeConfirm();
    closeAddModal();
  }
});

/* ════════════════════════════════════════
   사이드바 유저 정보 업데이트
════════════════════════════════════════ */
function updateSidebarUser(user) {
  const name     = localStorage.getItem('userName') || user.displayName || '강사';
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
   인증 상태 감지 — 권한 가드 & 진입점
════════════════════════════════════════ */
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.replace('../login.html');
    return;
  }
  currentUser = user;
  localStorage.setItem('userName',  user.displayName || '강사');
  localStorage.setItem('userUid',   user.uid);
  localStorage.setItem('userEmail', user.email || '');
  updateSidebarUser(user);
  initCalendar();
  initLectures(user.uid);
});
