// js/pages/calendar.js — 강의 캘린더 (Firebase + FullCalendar)

import { auth, db, subscribeLectures, authGuard, setupLogout } from '../api.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  TODAY, IN_7DAYS, TAX_LABEL, PROGRESS_LABEL,
  STATUS_META as STATUS_META_BASE,
  parseDate, escapeHtml, formatDateKo, calcDuration,
  buildTimeOptions, updateDurationDisplay, syncEndTimeOptions, initTimeSelects,
  getTodayString, updateSidebarProfile,
} from '../utils.js';

/* ════════════════════════════════════════
   calendar.js 전용 확장
   — doc(서류 미비) 상태가 추가되므로 classifyStatus와 STATUS_META를 로컬 오버라이드
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
let activeModalId = null;
let editingLecId  = null;
let unsubLectures = null;

/* ════════════════════════════════════════
   이벤트 색상 — 투트랙 (progressStatus + isPaid)
════════════════════════════════════════ */
function getEventColor(lec) {
  const prog = lec.progressStatus || 'scheduled';
  const d    = parseDate(lec.date);

  if (prog === 'cancelled') {
    return { bg: '#f9fafb', border: '#d1d5db', text: '#9ca3af' };
  }

  if (prog === 'done') {
    return lec.isPaid
      ? { bg: '#059669', border: '#047857', text: '#fff' }
      : { bg: '#e5e7eb', border: '#9ca3af', text: '#ef4444' };
  }

  if (prog === 'admin') {
    return { bg: '#d1fae5', border: '#6ee7b7', text: '#b91c1c' };
  }

  if (prog === 'discussing') {
    return { bg: '#ede9fe', border: '#a78bfa', text: '#5b21b6' };
  }

  if (d < TODAY) {
    return lec.isPaid
      ? { bg: '#9ca3af', border: '#6b7280', text: '#fff' }
      : { bg: '#e5e7eb', border: '#9ca3af', text: '#ef4444' };
  }
  if (d <= IN_7DAYS) {
    return { bg: '#f59e0b', border: '#d97706', text: '#fff' };
  }
  return { bg: '#0ea5e9', border: '#0284c7', text: '#fff' };
}

/* ════════════════════════════════════════
   주간 뷰 동적 시간 범위 계산
   기본 07:00 ~ 21:00, 강의 데이터에 맞춰 확장
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

  minH = Math.max(0,  minH);
  maxH = Math.min(24, maxH);

  return {
    slotMinTime: `${String(minH).padStart(2, '0')}:00:00`,
    slotMaxTime: `${String(maxH).padStart(2, '0')}:00:00`,
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
    initialView: 'dayGridMonth',
    locale:      'ko',
    height:      'auto',
    headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
    slotMinTime:   '07:00:00',
    slotMaxTime:   '21:00:00',
    slotDuration:  '00:30:00',
    allDaySlot:    false,
    nowIndicator:  true,
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
   모달 모드 전환
════════════════════════════════════════ */
const modalBackdrop   = document.getElementById('modal-backdrop');
const confirmBackdrop = document.getElementById('confirm-backdrop');

function switchMode(mode) {
  const viewPanel    = document.getElementById('view-panel');
  const formPanel    = document.getElementById('form-panel');
  const viewFooter   = document.getElementById('view-footer');
  const formFooter   = document.getElementById('form-footer');
  const metaRow      = document.getElementById('modal-meta-row');
  const formSubtitle = document.getElementById('modal-form-subtitle');

  const isView = (mode === 'view');
  viewPanel.style.display    = isView ? '' : 'none';
  formPanel.style.display    = isView ? 'none' : '';
  viewFooter.style.display   = isView ? 'flex' : 'none';
  formFooter.style.display   = isView ? 'none' : 'flex';
  metaRow.style.display      = isView ? '' : 'none';
  if (formSubtitle) formSubtitle.style.display = isView ? 'none' : '';
}

/* ════════════════════════════════════════
   뷰 패널 데이터 채우기
════════════════════════════════════════ */
function populateView(lec) {
  if (!lec) return;

  const status = classifyStatus(lec);
  const meta   = STATUS_META[status] || { label: status, cls: '' };
  const { full } = formatDateKo(lec.date);

  document.getElementById('modal-title').textContent       = lec.title || '(제목 없음)';
  document.getElementById('modal-badge').className         = `lec-badge ${meta.cls}`;
  document.getElementById('modal-badge').textContent       = meta.label;
  document.getElementById('modal-date-meta').textContent   = `${full} · ${lec.timeStart}~${lec.timeEnd}`;
  document.getElementById('modal-client-meta').textContent = lec.client || '—';

  document.getElementById('v-date').textContent           = full;
  document.getElementById('v-time').textContent           = `${lec.timeStart} ~ ${lec.timeEnd}`;
  document.getElementById('v-total-duration').textContent = calcDuration(lec.timeStart, lec.timeEnd);
  document.getElementById('v-title').textContent          = lec.title || '—';
  document.getElementById('v-client').textContent         = lec.client || '—';
  document.getElementById('v-fee').textContent            = `₩${(Number(lec.fee) || 0).toLocaleString()}`;

  document.getElementById('v-session-current').textContent = lec.sessionCurrent ? `${lec.sessionCurrent}회` : '—';
  document.getElementById('v-session-total').textContent   = lec.sessionTotal   ? `${lec.sessionTotal}회`   : '—';
  document.getElementById('v-participants').textContent    = lec.participants    ? `${lec.participants}명`   : '—';
  document.getElementById('v-group-info').textContent      = lec.groupInfo   || '—';
  document.getElementById('v-topic').textContent           = lec.topic       || '—';
  document.getElementById('v-supplies').textContent        = lec.supplies    || '—';
  document.getElementById('v-place').textContent           = lec.place       || '—';
  document.getElementById('v-parking').textContent         = lec.parkingInfo || '—';

  const mgrName  = lec.managerName  || '';
  const mgrPhone = lec.managerPhone || '';
  const mgrEmail = lec.managerEmail || '';

  document.getElementById('v-mgr-avatar').textContent      = mgrName ? mgrName.charAt(0) : '담';
  document.getElementById('v-mgr-name').textContent        = mgrName || '담당자 미등록';
  document.getElementById('v-mgr-sub').textContent         = mgrPhone || '연락처 미등록';
  document.getElementById('v-mgr-email-text').textContent  = mgrEmail || '—';

  const phoneLink = document.getElementById('v-mgr-phone');
  if (mgrPhone) { phoneLink.href = `tel:${mgrPhone}`; phoneLink.style.opacity = ''; phoneLink.style.pointerEvents = ''; }
  else          { phoneLink.href = '#'; phoneLink.style.opacity = '0.35'; phoneLink.style.pointerEvents = 'none'; }

  const emailLink = document.getElementById('v-mgr-email-link');
  if (mgrEmail) { emailLink.href = `mailto:${mgrEmail}`; emailLink.style.opacity = ''; emailLink.style.pointerEvents = ''; }
  else          { emailLink.href = '#'; emailLink.style.opacity = '0.35'; emailLink.style.pointerEvents = 'none'; }

  document.getElementById('v-progress').textContent     = PROGRESS_LABEL[lec.progressStatus || 'scheduled'] || '—';
  const paidEl = document.getElementById('v-paid-status');
  paidEl.textContent = lec.isPaid ? '✅ 입금 완료' : '❌ 미입금';
  paidEl.className   = `modal-info-value paid-badge${lec.isPaid ? ' paid-badge--paid' : ' paid-badge--unpaid'}`;
  document.getElementById('v-payment-date').textContent = lec.paymentDate || '미정';
  document.getElementById('v-tax').textContent          = TAX_LABEL[lec.taxType] || '—';

  const memoEl = document.getElementById('v-memo');
  if (lec.memo) { memoEl.textContent = lec.memo; memoEl.classList.remove('is-empty'); }
  else          { memoEl.textContent = '메모 없음'; memoEl.classList.add('is-empty'); }
}

/* ════════════════════════════════════════
   폼 패널 데이터 채우기
════════════════════════════════════════ */
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
   통합 모달 열기 (뷰 모드)
════════════════════════════════════════ */
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
modalBackdrop?.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

/* ── 강의 추가 → 폼 모드 ── */
function openAddModal() {
  activeModalId = null;
  editingLecId  = null;
  document.getElementById('modal-title').textContent = '강의 추가';
  const sub = document.getElementById('modal-form-subtitle');
  if (sub) sub.textContent = '새 강의 일정을 등록하세요.';

  document.getElementById('lec-form')?.reset();

  const now = new Date();
  const af  = document.getElementById('af-date');
  if (af) af.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const startSel = document.getElementById('af-time-start');
  if (startSel) { startSel.innerHTML = buildTimeOptions(); startSel.value = '09:00'; }
  syncEndTimeOptions('10:00');
  updateDurationDisplay();

  const progressSel = document.getElementById('af-progress');
  if (progressSel) progressSel.value = 'scheduled';
  const paidSel = document.getElementById('af-paid-status');
  if (paidSel) paidSel.value = 'false';
  const taxSel = document.getElementById('af-tax');
  if (taxSel) taxSel.value = 'income3_3';

  switchMode('form');
  modalBackdrop?.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('af-title')?.focus();
}

document.getElementById('btn-add-lecture')?.addEventListener('click', openAddModal);

/* ── 수정하기 → 폼 모드 전환 ── */
document.getElementById('btn-modal-edit')?.addEventListener('click', () => {
  if (!activeModalId) return;
  const lec = allLectures.find(l => l.id === activeModalId);
  if (!lec) return;
  editingLecId = activeModalId;

  document.getElementById('modal-title').textContent = '강의 수정';
  const sub = document.getElementById('modal-form-subtitle');
  if (sub) sub.textContent = '강의 정보를 수정하세요.';

  populateForm(lec);
  switchMode('form');
  document.getElementById('af-title')?.focus();
});

/* ── 폼 취소 ── */
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

/* ── 폼 저장 ── */
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
    date,
    timeStart,
    timeEnd,
    title,
    client,
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
        allLectures[idx] = {
          ...allLectures[idx],
          ...payload,
          _status: classifyStatus({ ...allLectures[idx], ...payload }),
        };
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
        uid: currentUser.uid,
        ...payload,
        isDocumented: false,
        createdAt:    serverTimestamp(),
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

/* ════════════════════════════════════════
   삭제 컨펌
════════════════════════════════════════ */
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
   로그아웃
════════════════════════════════════════ */
setupLogout(() => { if (unsubLectures) unsubLectures(); });

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
  updateSidebarProfile(localStorage.getItem('userName') || '강사');
  initCalendar();
  initLectures(user.uid);
  initTimeSelects();
});
