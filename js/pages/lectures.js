// js/pages/lectures.js — 강의 관리 (Firebase 연동, ES Module)

import { subscribeLectures, authGuard } from '../api.js';
import { TODAY, STATUS_META, escapeHtml, formatDateKo, classifyStatus } from '../utils.js';
import { initLectureModal, openModal } from '../components/lectureModal.js';

/* ════════════════════════════════════════
   상태
════════════════════════════════════════ */
let currentUser   = null;
let allLectures   = [];
let currentFilter = 'all';
let searchQuery   = '';
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
const filterTabs    = document.querySelectorAll('.filter-tab');
const tableBody     = document.getElementById('lectures-tbody');
const resultCountEl = document.getElementById('result-count');
const searchInput   = document.getElementById('table-search');

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
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openModal(row.dataset.id); });
  });
}

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
  }, err => { console.error('[강비서] 강의 구독 오류:', err); });
}

/* ════════════════════════════════════════
   초기화
════════════════════════════════════════ */
renderTable();
updateTabCounts();
updateSummaryChips();

/* ════════════════════════════════════════
   인증 상태 감지
════════════════════════════════════════ */
authGuard(user => {
  currentUser = user;
  initLectureModal(() => ({ allLectures, currentUser }));
  initLectures(user.uid);
}, {
  withModal: true,
  cleanupFn: () => unsubLectures?.(),
});
