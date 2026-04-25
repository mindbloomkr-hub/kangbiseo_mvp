// js/pages/lectures.js — 강의 관리 (Firebase 연동, ES Module)

import { auth, db, subscribeLectures, authGuard, setupLogout } from '../api.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  DAY_KO, TODAY, IN_7DAYS, TAX_LABEL, PROGRESS_LABEL, STATUS_META,
  parseDate, escapeHtml, formatDateKo, calcDuration, classifyStatus,
  buildTimeOptions, updateDurationDisplay, syncEndTimeOptions, initTimeSelects,
  updateSidebarProfile,
} from '../utils.js';

/* ════════════════════════════════════════
   상태
════════════════════════════════════════ */
let currentUser   = null;
let allLectures   = [];
let currentFilter = 'all';
let searchQuery   = '';
let activeModalId = null;
let editingLecId  = null;
let unsubLectures = null;

/* ════════════════════════════════════════
   필터 함수
════════════════════════════════════════ */
const FILTER_FN = {
  all:        ()  => true,
  urgent:     l   => l._status === 'urgent',
  upcoming:   l   => l._status === 'upcoming',
  admin:      l   => l._status === 'admin',
  done:       l   => l._status === 'done',
  discussing: l   => l._status === 'discussing',
  cancelled:  l   => l._status === 'cancelled',
  unpaid:     l   => l._status === 'unpaid',
};

function getFilteredLectures() {
  const fn = FILTER_FN[currentFilter] || FILTER_FN.all;
  let list = allLectures.filter(fn);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(l =>
      (l.title  || '').toLowerCase().includes(q) ||
      (l.client || '').toLowerCase().includes(q) ||
      (l.place  || '').toLowerCase().includes(q) ||
      (l.topic  || '').toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/* ════════════════════════════════════════
   DOM 참조
════════════════════════════════════════ */
const filterTabs      = document.querySelectorAll('.filter-tab');
const tableBody       = document.getElementById('lectures-tbody');
const resultCountEl   = document.getElementById('result-count');
const searchInput     = document.getElementById('table-search');
const modalBackdrop   = document.getElementById('modal-backdrop');
const confirmBackdrop = document.getElementById('confirm-backdrop');

/* ════════════════════════════════════════
   탭 카운트 + 요약 칩
════════════════════════════════════════ */
function updateTabCounts() {
  filterTabs.forEach(tab => {
    const fn    = FILTER_FN[tab.dataset.filter];
    const count = fn ? allLectures.filter(fn).length : allLectures.length;
    const el    = tab.querySelector('.filter-tab-count');
    if (el) el.textContent = count;
  });
}

function updateSummaryChips() {
  const now      = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthFee = allLectures
    .filter(l => l.date?.startsWith(monthStr))
    .reduce((s, l) => s + (Number(l.fee) || 0), 0);
  const unpaid   = allLectures.filter(l => l._status === 'unpaid');
  const upcoming = allLectures.filter(l => ['upcoming', 'urgent', 'discussing'].includes(l._status));

  const $ = id => document.getElementById(id);
  if ($('chip-total'))    $('chip-total').textContent    = `총 ${allLectures.length}건`;
  if ($('chip-fee'))      $('chip-fee').textContent      = `이번 달 총 강사료 ₩${(thisMonthFee / 10000).toFixed(0)}만원`;
  if ($('chip-unpaid'))   $('chip-unpaid').textContent   = `미입금 ${unpaid.length}건`;
  if ($('chip-upcoming')) $('chip-upcoming').textContent = `예정 ${upcoming.length}건`;
}

function updateNavBadge() {
  const todayStr = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}-${String(TODAY.getDate()).padStart(2,'0')}`;
  const count = allLectures.filter(l =>
    l.date >= todayStr && !['cancelled', 'done'].includes(l._status)
  ).length;
  localStorage.setItem('navBadgeCount', String(count));
  const badgeEl = document.getElementById('nav-badge-lectures');
  if (!badgeEl) return;
  badgeEl.textContent   = count;
  badgeEl.style.display = count > 0 ? '' : 'none';
}

/* ════════════════════════════════════════
   테이블 렌더링
════════════════════════════════════════ */
function renderTable() {
  const list = getFilteredLectures();
  if (resultCountEl) resultCountEl.innerHTML = `총 <strong>${list.length}건</strong>`;

  if (list.length === 0) {
    tableBody.innerHTML = `
      <tr><td colspan="7">
        <div class="table-empty">
          <div class="table-empty-icon">🔍</div>
          <p class="table-empty-text">${
            allLectures.length === 0
              ? '등록된 강의가 없어요.<br/>+ 강의 추가 버튼으로 첫 강의를 등록해 보세요.'
              : '해당 조건에 맞는 강의가 없어요.'
          }</p>
        </div>
      </td></tr>`;
    return;
  }

  tableBody.innerHTML = list.map(lec => {
    const { main, day } = formatDateKo(lec.date);
    const meta   = STATUS_META[lec._status] || { label: lec._status, cls: '' };
    const rowCls = lec._status === 'urgent' ? 'is-urgent' : lec._status === 'unpaid' ? 'is-unpaid' : '';
    return `
      <tr class="${rowCls}" data-id="${lec.id}" tabindex="0" role="button" aria-label="${escapeHtml(lec.title)} 상세 보기">
        <td>
          <div class="td-date">
            <div class="td-date-main">${main}</div>
            <div class="td-date-day">${day}요일</div>
          </div>
        </td>
        <td class="td-time">${lec.timeStart}~${lec.timeEnd}</td>
        <td>
          <div class="td-title">${escapeHtml(lec.title)}</div>
          <div class="td-title-sub">${escapeHtml(lec.topic || lec.place || '')}</div>
        </td>
        <td class="td-client">${escapeHtml(lec.client)}</td>
        <td class="td-place col-place">${escapeHtml(lec.place || '')}</td>
        <td class="td-fee col-fee">₩${(Number(lec.fee) || 0).toLocaleString()}</td>
        <td class="col-status"><span class="lec-badge ${meta.cls}">${meta.label}</span></td>
      </tr>`;
  }).join('');

  tableBody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click',   () => openModal(row.dataset.id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') openModal(row.dataset.id);
    });
  });
}

/* ════════════════════════════════════════
   모달 모드 전환 헬퍼
════════════════════════════════════════ */
function switchMode(mode) {
  const viewPanel     = document.getElementById('view-panel');
  const formPanel     = document.getElementById('form-panel');
  const viewFooter    = document.getElementById('view-footer');
  const formFooter    = document.getElementById('form-footer');
  const metaRow       = document.getElementById('modal-meta-row');
  const formSubtitle  = document.getElementById('modal-form-subtitle');

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

  const { full } = formatDateKo(lec.date);
  const meta = STATUS_META[lec._status] || { label: lec._status, cls: '' };

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
  document.getElementById('v-group-info').textContent      = lec.groupInfo  || '—';
  document.getElementById('v-topic').textContent           = lec.topic      || '—';
  document.getElementById('v-supplies').textContent        = lec.supplies   || '—';
  document.getElementById('v-place').textContent           = lec.place      || '—';
  document.getElementById('v-parking').textContent         = lec.parkingInfo || '—';

  const mgrName  = lec.managerName  || '';
  const mgrPhone = lec.managerPhone || '';
  const mgrEmail = lec.managerEmail || '';

  document.getElementById('v-mgr-avatar').textContent = mgrName ? mgrName.charAt(0) : '담';
  document.getElementById('v-mgr-name').textContent   = mgrName || '담당자 미등록';
  document.getElementById('v-mgr-sub').textContent    = mgrPhone || '연락처 미등록';
  document.getElementById('v-mgr-email-text').textContent = mgrEmail || '—';

  const phoneLink = document.getElementById('v-mgr-phone');
  if (mgrPhone) {
    phoneLink.href = `tel:${mgrPhone}`; phoneLink.style.opacity = ''; phoneLink.style.pointerEvents = '';
  } else {
    phoneLink.href = '#'; phoneLink.style.opacity = '0.35'; phoneLink.style.pointerEvents = 'none';
  }
  const emailLink = document.getElementById('v-mgr-email-link');
  if (mgrEmail) {
    emailLink.href = `mailto:${mgrEmail}`; emailLink.style.opacity = ''; emailLink.style.pointerEvents = '';
  } else {
    emailLink.href = '#'; emailLink.style.opacity = '0.35'; emailLink.style.pointerEvents = 'none';
  }

  document.getElementById('v-progress').textContent     = PROGRESS_LABEL[lec.progressStatus || 'scheduled'] || '—';
  const paidEl = document.getElementById('v-paid-status');
  paidEl.textContent = lec.isPaid ? '✅ 입금 완료' : '❌ 미입금';
  paidEl.className   = `modal-info-value paid-badge${lec.isPaid ? ' paid-badge--paid' : ' paid-badge--unpaid'}`;
  document.getElementById('v-payment-date').textContent = lec.paymentDate || '미정';
  document.getElementById('v-tax').textContent          = TAX_LABEL[lec.taxType] || '—';

  const memoEl = document.getElementById('v-memo');
  if (lec.memo) {
    memoEl.textContent = lec.memo;
    memoEl.classList.remove('is-empty');
  } else {
    memoEl.textContent = '메모 없음';
    memoEl.classList.add('is-empty');
  }
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
   통합 모달 열기
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
  document.getElementById('modal-close-btn').focus();
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
  const formPanel = document.getElementById('form-panel');
  const isFormOpen = formPanel && formPanel.style.display !== 'none';
  if (isFormOpen) {
    const dirty = ['af-title','af-client','af-fee','af-topic','af-supplies','af-place','af-memo','af-group-info']
      .some(id => (document.getElementById(id)?.value || '').trim() !== '');
    if (dirty) {
      if (!confirm('작성 중인 내용이 사라집니다. 계속 닫으시겠어요?')) return;
    }
  }
  closeModal();
});

/* ── 강의 추가 → 폼 모드로 열기 ── */
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

/* ── 수정하기 버튼 → 폼 모드로 전환 ── */
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

/* ── 폼 모드 취소 ── */
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
    console.error('[강비서] 삭제 오류:', err);
    window.showToast?.('삭제에 실패했습니다.', 'error');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); }
});

/* ════════════════════════════════════════
   필터 탭
════════════════════════════════════════ */
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    currentFilter = tab.dataset.filter;
    renderTable();
  });
});

/* ════════════════════════════════════════
   검색
════════════════════════════════════════ */
searchInput?.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  renderTable();
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
    allLectures = snapshot.docs
      .map(d => { const data = d.data(); return { id: d.id, ...data, _status: classifyStatus(data) }; })
      .sort((a, b) => a.date.localeCompare(b.date));
    updateTabCounts();
    updateSummaryChips();
    updateNavBadge();
    renderTable();
  }, err => {
    console.error('[강비서] 강의 구독 오류:', err);
  });
}

/* ════════════════════════════════════════
   인증 상태 감지
════════════════════════════════════════ */
authGuard(user => {
  currentUser = user;
  updateSidebarProfile(localStorage.getItem('userName') || '강사');
  initLectures(user.uid);
});

/* ════════════════════════════════════════
   초기화
════════════════════════════════════════ */
renderTable();
updateTabCounts();
updateSummaryChips();
initTimeSelects();
