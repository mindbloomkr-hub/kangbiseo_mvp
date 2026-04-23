// js/pages/lectures.js — 강의 관리 (Firebase 연동, ES Module)

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

const TAX_LABEL = { income3_3: '사업소득 3.3%', income8_8: '기타소득 8.8%' };
const PROGRESS_LABEL = {
  discussing: '논의 중',
  scheduled:  '강의 예정',
  admin:      '행정 대기',
  done:       '진행 완료',
  cancelled:  '취소/드롭',
};

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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateKo(dateStr) {
  const d = parseDate(dateStr);
  return { main: `${d.getMonth() + 1}/${d.getDate()}`, day: DAY_KO[d.getDay()] };
}

/* ════════════════════════════════════════
   강의 상태 자동 분류
   progressStatus 우선, 미지정 시 날짜 기반
════════════════════════════════════════ */
function classifyStatus(lec) {
  const prog = lec.progressStatus || 'scheduled';
  if (prog === 'cancelled')  return 'cancelled';
  if (prog === 'done')       return 'done';
  if (prog === 'admin')      return 'admin';
  if (prog === 'discussing') return 'discussing';

  /* scheduled / legacy: 날짜 기반 세분화 */
  const d = parseDate(lec.date);
  if (d < TODAY) return lec.isPaid ? 'done' : 'unpaid';
  if (d <= IN_7DAYS) return 'urgent';
  return 'upcoming';
}

const STATUS_META = {
  discussing: { label: '논의 중',   cls: 'lec-badge--discussing' },
  urgent:     { label: '준비 임박', cls: 'lec-badge--urgent'     },
  upcoming:   { label: '강의 예정', cls: 'lec-badge--scheduled'  },
  admin:      { label: '행정 대기', cls: 'lec-badge--admin'      },
  done:       { label: '진행 완료', cls: 'lec-badge--done'       },
  unpaid:     { label: '미입금',    cls: 'lec-badge--unpaid'     },
  cancelled:  { label: '취소',      cls: 'lec-badge--cancelled'  },
};

/* ════════════════════════════════════════
   필터 함수
════════════════════════════════════════ */
const FILTER_FN = {
  all:      ()  => true,
  urgent:   l   => l._status === 'urgent',
  upcoming: l   => ['upcoming', 'urgent', 'discussing'].includes(l._status),
  doc:      l   => l._status === 'admin',        // 행정 대기
  unpaid:   l   => l._status === 'unpaid',
  done:     l   => ['done', 'cancelled'].includes(l._status),
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
const filterTabs       = document.querySelectorAll('.filter-tab');
const tableBody        = document.getElementById('lectures-tbody');
const resultCountEl    = document.getElementById('result-count');
const searchInput      = document.getElementById('table-search');
const modalBackdrop    = document.getElementById('modal-backdrop');
const confirmBackdrop  = document.getElementById('confirm-backdrop');
const addModalBackdrop = document.getElementById('add-modal-backdrop');

/* ════════════════════════════════════════
   탭 카운트 + 요약 칩 업데이트
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
    .filter(l => l.date.startsWith(monthStr))
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
  badgeEl.textContent  = count;
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
   상세 모달 열기
════════════════════════════════════════ */
function openModal(id) {
  const lec = allLectures.find(l => l.id === id);
  if (!lec) return;
  activeModalId = id;

  const { main, day } = formatDateKo(lec.date);
  const meta = STATUS_META[lec._status] || { label: lec._status, cls: '' };

  /* 헤더 */
  document.getElementById('modal-title').textContent       = escapeHtml(lec.title);
  document.getElementById('modal-subtitle').textContent    = '';
  document.getElementById('modal-badge').className         = `lec-badge ${meta.cls}`;
  document.getElementById('modal-badge').textContent       = meta.label;
  document.getElementById('modal-date-meta').textContent   = `${main} (${day}) · ${lec.timeStart}~${lec.timeEnd}`;
  document.getElementById('modal-client-meta').textContent = escapeHtml(lec.client || '—');

  /* 기본 정보 */
  document.getElementById('modal-place').textContent   = escapeHtml(lec.place    || '—');
  document.getElementById('modal-parking').textContent = escapeHtml(lec.parkingInfo || '—');
  document.getElementById('modal-time').textContent    = `${lec.timeStart} ~ ${lec.timeEnd}`;
  document.getElementById('modal-fee').textContent     = `₩${(Number(lec.fee) || 0).toLocaleString()}`;
  document.getElementById('modal-progress').textContent = PROGRESS_LABEL[lec.progressStatus || 'scheduled'] || '—';

  /* 상세 정보 */
  const sessionCurr  = lec.sessionCurrent ? String(lec.sessionCurrent) : '';
  const sessionTotal = lec.sessionTotal   ? String(lec.sessionTotal)   : '';
  document.getElementById('modal-session').textContent =
    sessionCurr && sessionTotal ? `${sessionCurr} / ${sessionTotal} 회` :
    sessionCurr ? `${sessionCurr} 회` : '—';
  document.getElementById('modal-participants').textContent = lec.participants ? `${lec.participants}명` : '—';
  document.getElementById('modal-duration').textContent    = escapeHtml(lec.durationText || '—');
  document.getElementById('modal-group-info').textContent  = escapeHtml(lec.groupInfo    || '—');
  document.getElementById('modal-topic').textContent       = escapeHtml(lec.topic        || '—');
  document.getElementById('modal-supplies').textContent    = escapeHtml(lec.supplies     || '—');

  /* 담당자 */
  const mgrName  = lec.managerName  || '—';
  const mgrPhone = lec.managerPhone || '';
  const mgrEmail = lec.managerEmail || '';
  document.getElementById('modal-mgr-avatar').textContent = mgrName.charAt(0);
  document.getElementById('modal-mgr-name').textContent   = escapeHtml(mgrName);
  document.getElementById('modal-mgr-sub').textContent    = mgrPhone || '연락처 미등록';

  const phoneLink = document.getElementById('modal-mgr-phone');
  if (mgrPhone) {
    phoneLink.href = `tel:${mgrPhone}`; phoneLink.style.opacity = ''; phoneLink.style.pointerEvents = '';
  } else {
    phoneLink.href = '#'; phoneLink.style.opacity = '0.35'; phoneLink.style.pointerEvents = 'none';
  }
  const emailLink = document.getElementById('modal-mgr-email');
  if (mgrEmail) {
    emailLink.href = `mailto:${mgrEmail}`; emailLink.style.opacity = ''; emailLink.style.pointerEvents = '';
  } else {
    emailLink.href = '#'; emailLink.style.opacity = '0.35'; emailLink.style.pointerEvents = 'none';
  }

  /* 정산 & 행정 */
  document.getElementById('modal-paiddate').textContent = lec.paymentDate || '미정';
  document.getElementById('modal-tax').textContent      = TAX_LABEL[lec.taxType] || '—';
  /* 정산 상태 라디오 */
  const paidRadio = document.querySelector(`input[name="modal-paid"][value="${lec.isPaid ? 'true' : 'false'}"]`);
  if (paidRadio) paidRadio.checked = true;

  /* 메모 */
  document.getElementById('modal-memo').value = lec.memo || '';

  modalBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close-btn').focus();
}

function closeModal() {
  modalBackdrop?.classList.remove('open');
  document.body.style.overflow = '';
  activeModalId = null;
}

document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

/* ── 메모 + 정산 상태 저장 ── */
document.getElementById('btn-modal-save')?.addEventListener('click', async () => {
  if (!activeModalId) return;
  const memo     = document.getElementById('modal-memo').value;
  const isPaidRaw = document.querySelector('input[name="modal-paid"]:checked')?.value;
  const isPaid   = isPaidRaw === 'true';
  try {
    await updateDoc(doc(db, 'lectures', activeModalId), { memo, isPaid });
    closeModal();
    window.showToast?.('저장되었습니다.', 'success');
  } catch (err) {
    console.error('[강비서] 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다.', 'error');
  }
});

/* ── 수정 버튼 → 수정 폼 ── */
document.getElementById('btn-modal-edit')?.addEventListener('click', () => {
  const id = activeModalId;
  closeModal();
  openEditModal(id);
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
  if (e.key === 'Escape') { closeModal(); closeConfirm(); closeAddModal(); }
});

/* ════════════════════════════════════════
   시간 선택 (10분 단위 select)
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
}

function initTimeSelects() {
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (startSel) startSel.innerHTML = buildTimeOptions();
  if (endSel)   endSel.innerHTML   = buildTimeOptions();
  startSel?.addEventListener('change', () => syncEndTimeOptions());
}

/* ════════════════════════════════════════
   강의 추가 / 수정 통합 모달
════════════════════════════════════════ */
function openAddModal() {
  editingLecId = null;
  document.getElementById('add-modal-title').textContent = '강의 추가';
  document.getElementById('add-lecture-form')?.reset();

  /* 오늘 날짜 기본값 */
  const now = new Date();
  const af  = document.getElementById('af-date');
  if (af) af.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  /* 시간 셀렉트 초기화 */
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (startSel) { startSel.innerHTML = buildTimeOptions(); startSel.value = '09:00'; }
  if (endSel)   { syncEndTimeOptions('10:00'); }

  /* 기본 진행 상태 */
  const progressSel = document.getElementById('af-progress');
  if (progressSel) progressSel.value = 'scheduled';

  /* 기본 라디오 */
  const paidRadio = document.querySelector('input[name="af-paid"][value="false"]');
  if (paidRadio) paidRadio.checked = true;
  const taxRadio = document.querySelector('input[name="af-tax"][value="income3_3"]');
  if (taxRadio) taxRadio.checked = true;

  addModalBackdrop?.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('af-title')?.focus();
}

function openEditModal(id) {
  const lec = allLectures.find(l => l.id === id);
  if (!lec) return;
  editingLecId = id;
  document.getElementById('add-modal-title').textContent = '강의 수정';

  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
  set('af-date',            lec.date);
  set('af-title',           lec.title);
  set('af-client',          lec.client);
  set('af-fee',             lec.fee);
  set('af-place',           lec.place);
  set('af-parking',         lec.parkingInfo);
  set('af-session-current', lec.sessionCurrent);
  set('af-session-total',   lec.sessionTotal);
  set('af-duration',        lec.durationText);
  set('af-participants',    lec.participants);
  set('af-group-info',      lec.groupInfo);
  set('af-topic',           lec.topic);
  set('af-supplies',        lec.supplies);
  set('af-manager-name',    lec.managerName);
  set('af-manager-phone',   lec.managerPhone);
  set('af-manager-email',   lec.managerEmail);
  set('af-progress',        lec.progressStatus || 'scheduled');
  set('af-payment-date',    lec.paymentDate);
  set('af-memo',            lec.memo);

  /* 시간 셀렉트 */
  const startSel = document.getElementById('af-time-start');
  if (startSel) {
    startSel.innerHTML = buildTimeOptions();
    startSel.value     = lec.timeStart || '';
    syncEndTimeOptions(lec.timeEnd || '');
  }

  /* 라디오 */
  const paidVal  = lec.isPaid ? 'true' : 'false';
  const paidR    = document.querySelector(`input[name="af-paid"][value="${paidVal}"]`);
  if (paidR) paidR.checked = true;
  const taxR = document.querySelector(`input[name="af-tax"][value="${lec.taxType || 'income3_3'}"]`);
  if (taxR) taxR.checked = true;

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
addModalBackdrop?.addEventListener('click', e => { if (e.target === addModalBackdrop) closeAddModal(); });

/* ── 추가 / 수정 저장 ── */
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
  if (timeEnd <= timeStart) {
    window.showToast?.('종료 시간은 시작 시간보다 이후여야 합니다.', 'error');
    return;
  }

  const submitBtn = document.getElementById('add-modal-submit');
  submitBtn.disabled    = true;
  submitBtn.textContent = '저장 중...';

  const isPaid = document.querySelector('input[name="af-paid"]:checked')?.value === 'true';
  const taxType = document.querySelector('input[name="af-tax"]:checked')?.value || 'income3_3';

  const payload = {
    date,
    timeStart,
    timeEnd,
    title,
    client,
    place:          get('af-place'),
    parkingInfo:    get('af-parking'),
    fee:            Number(feeRaw),
    sessionCurrent: Number(get('af-session-current'))  || null,
    sessionTotal:   Number(get('af-session-total'))     || null,
    durationText:   get('af-duration'),
    participants:   Number(get('af-participants'))      || null,
    groupInfo:      get('af-group-info'),
    topic:          get('af-topic'),
    supplies:       get('af-supplies'),
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
    } else {
      if (!currentUser) return;
      await addDoc(collection(db, 'lectures'), {
        uid:       currentUser.uid,
        ...payload,
        isDocumented: false,
        createdAt: serverTimestamp(),
      });
      window.showToast?.('강의가 등록되었습니다.', 'success');
    }
    closeAddModal();
  } catch (err) {
    console.error('[강비서] 강의 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다.', 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = '저장하기';
  }
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
   사이드바 유저
════════════════════════════════════════ */
function updateSidebarUser(user) {
  const nameEl   = document.querySelector('.sidebar-user-name');
  const avatarEl = document.querySelector('.sidebar-avatar');
  if (!nameEl || !avatarEl) return;
  const name = localStorage.getItem('userName') || user.displayName || '강사';
  nameEl.textContent   = name + ' 강사';
  avatarEl.textContent = name.charAt(0);
}

/* ════════════════════════════════════════
   로그아웃
════════════════════════════════════════ */
document.getElementById('logout-btn')?.addEventListener('click', async e => {
  e.preventDefault();
  try {
    if (unsubLectures) unsubLectures();
    await signOut(auth);
    localStorage.removeItem('userName');
    localStorage.removeItem('userUid');
    localStorage.removeItem('userEmail');
    window.location.replace('../login.html');
  } catch (err) {
    console.error('[강비서] 로그아웃 오류:', err);
  }
});

/* ════════════════════════════════════════
   Firestore 실시간 구독
════════════════════════════════════════ */
function initLectures(uid) {
  if (unsubLectures) unsubLectures();
  const q = query(collection(db, 'lectures'), where('uid', '==', uid));
  unsubLectures = onSnapshot(q, snapshot => {
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
onAuthStateChanged(auth, user => {
  if (!user) { window.location.replace('../login.html'); return; }
  currentUser = user;
  localStorage.setItem('userName',  user.displayName || '강사');
  localStorage.setItem('userUid',   user.uid);
  localStorage.setItem('userEmail', user.email || '');
  updateSidebarUser(user);
  initLectures(user.uid);
});

/* ════════════════════════════════════════
   초기화 (데이터 로딩 전 빈 렌더 + 시간 셀렉트)
════════════════════════════════════════ */
renderTable();
updateTabCounts();
updateSummaryChips();
initTimeSelects();
