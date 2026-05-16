// js/pages/lectures.js — 강의 관리 (Firebase 연동, ES Module)

import { subscribeLectures, authGuard, db, getLectureCache, setLectureCache } from '../api.js';
import { writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { TODAY, STATUS_META, escapeHtml, formatDateKo, classifyStatus, positionPanel, calcDuration, timeToMin, formatDateString, calcPaymentDate } from '../utils.js';
import { openKakaoAddress } from '../services/kakaoAddressService.js';
import { initLectureModal, openModal, getTopicTags, getTopicDefaultSupplies } from '../components/lectureModal.js';
import { initMultiSessionModal, openAddModal as openMultiSessionModal } from '../components/multiSessionModal.js';

/* ════════════════════════════════════════
   상태
════════════════════════════════════════ */
let currentUser   = null;
let allLectures   = [];
let currentFilter = 'all';
let searchQuery   = '';
let searchStatus  = '';
let dateFrom      = '';
let dateTo        = '';
let filterTagId   = '';
let unsubLectures = null;
const selectedIds = new Set();
let _bmSupplies = []; // [{id, name, isChecked}] for batch edit supplies chip input
let _bmPresets  = []; // [{id, name, included}] for batch edit preset checkboxes

let _isLoading   = true;
let _currentPage = 0;
const PAGE_SIZE  = 30;

/* ════════════════════════════════════════
   필터 함수
════════════════════════════════════════ */
const FILTER_FN = {
  all:          ()  => true,
  urgent:       l   => l._status === 'urgent',
  scheduled:    l   => l._status === 'scheduled',
  onhold:       l   => l._status === 'onhold',
  done:         l   => l._status === 'done' || l._status === 'unpaid',
  discussing:   l   => l._status === 'discussing',
  cancelled:    l   => l._status === 'cancelled',
  unpaid:       l   => l._status === 'unpaid',
  needs_review: l   => l._status === 'needs_review',
};

function getFilteredLectures() {
  const fn = FILTER_FN[currentFilter] || FILTER_FN.all;
  let list = allLectures.filter(fn);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(l =>
      String(l.sessionTotal || '').toLowerCase().includes(q) ||
      String(l.sessionCurrent || '').toLowerCase().includes(q) ||
      (l.title       || '').toLowerCase().includes(q) ||
      (l.client      || '').toLowerCase().includes(q) ||
      (l.place       || '').toLowerCase().includes(q) ||
      (l.classroom   || '').toLowerCase().includes(q) ||
      (l.managerName || '').toLowerCase().includes(q)
    );
  }

  if (searchStatus) list = list.filter(l => (l.progressStatus || '') === searchStatus);
  if (dateFrom)     list = list.filter(l => l.date >= dateFrom);
  if (dateTo)       list = list.filter(l => l.date <= dateTo);

  if (filterTagId === 'default') {
    list = list.filter(l => l.topicTagId == null || l.topicTagId === '');
  } else if (filterTagId && filterTagId !== 'all') {
    const tid = Number(filterTagId);
    list = list.filter(l => l.topicTagId === tid);
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
  
  // 제외할 상태 목록 정의 (여기서 _status 이름을 사용하세요)
  const excludedStatuses = ['discussing', 'onhold', 'cancelled'];

  const activeLectures = allLectures.filter(l => !excludedStatuses.includes(l._status));

  const thisMonthFee = activeLectures
    .filter(l => l.date?.startsWith(monthStr))
    .reduce((s, l) => s + (Number(l.fee) || 0), 0);

  const unpaid   = allLectures.filter(l => l._status === 'unpaid');
  const upcoming = allLectures.filter(l => ['scheduled', 'urgent', 'discussing'].includes(l._status));

  const $ = id => document.getElementById(id);
  if ($('chip-total'))    $('chip-total').textContent    = `총 ${activeLectures.length}건`;
  if ($('chip-fee'))      $('chip-fee').textContent      = `이번 달 총 강사료 ₩${(thisMonthFee).toFixed(0)}만원`;
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
function _skeletonRows(n = 5) {
  return Array.from({ length: n }, () => `
    <tr class="skeleton-row">
      <td class="col-cb"></td>
      <td><span class="skeleton-cell skeleton-cell--short"></span></td>
      <td><span class="skeleton-cell skeleton-cell--medium"></span></td>
      <td><span class="skeleton-cell skeleton-cell--long"></span></td>
      <td><span class="skeleton-cell skeleton-cell--medium"></span></td>
      <td><span class="skeleton-cell skeleton-cell--medium"></span></td>
      <td><span class="skeleton-cell skeleton-cell--short"></span></td>
      <td><span class="skeleton-cell skeleton-cell--badge"></span></td>
    </tr>`).join('');
}

function _renderPagination(total) {
  let bar = document.getElementById('lec-pagination');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'lec-pagination';
    bar.className = 'lec-pagination';
    tableBody.closest('table')?.after(bar);
  }
  if (total < 30) { bar.style.setProperty('display', 'none', 'important'); return; }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) { bar.style.setProperty('display', 'none', 'important'); return; }
  bar.style.display = 'flex';
  bar.innerHTML = `
    <button class="lec-pagination__btn" id="lec-pg-prev" ${_currentPage === 0 ? 'disabled' : ''}>← 이전</button>
    <span class="lec-pagination__info">${_currentPage + 1} / ${totalPages}</span>
    <button class="lec-pagination__btn" id="lec-pg-next" ${_currentPage >= totalPages - 1 ? 'disabled' : ''}>다음 →</button>`;
  bar.querySelector('#lec-pg-prev')?.addEventListener('click', () => { _currentPage--; renderTable(); });
  bar.querySelector('#lec-pg-next')?.addEventListener('click', () => { _currentPage++; renderTable(); });
}

function renderTable() {
  if (_isLoading && allLectures.length === 0) {
    if (resultCountEl) resultCountEl.innerHTML = '로딩 중...';
    tableBody.innerHTML = _skeletonRows(5);
    return;
  }

  const list = getFilteredLectures();
  if (resultCountEl) resultCountEl.innerHTML = `총 <strong>${list.length}건</strong>`;

  if (list.length === 0) {
    tableBody.innerHTML = `
      <tr><td colspan="8">
        <div class="table-empty">
          <div class="table-empty-icon">🔍</div>
          <p class="table-empty-text">${
            allLectures.length === 0
              ? '등록된 강의가 없어요.<br/>+ 강의 추가 버튼으로 첫 강의를 등록해 보세요.'
              : '검색 결과가 없습니다.'
          }</p>
        </div>
      </td></tr>`;
    _renderPagination(0);
    return;
  }

  const start   = _currentPage * PAGE_SIZE;
  const page    = list.slice(start, start + PAGE_SIZE);

  tableBody.innerHTML = page.map(lec => {
    const { main, day } = formatDateKo(lec.date);
    const meta   = STATUS_META[lec._status] || { label: lec._status, cls: '' };
    const rowCls = lec._status === 'urgent' ? 'is-urgent' : lec._status === 'unpaid' ? 'is-unpaid' : '';
    const checked = selectedIds.has(lec.id) ? 'checked' : '';
    return `
      <tr class="${rowCls}" data-id="${lec.id}" tabindex="0" role="button" aria-label="${escapeHtml(lec.title)} 상세 보기">
        <td class="col-cb"><div class="row-cb-wrap"><input type="checkbox" class="row-cb" data-id="${lec.id}" ${checked} aria-label="선택" /></div></td>
        <td>
          <div class="td-sessionInfo">
            ${lec.sessionCurrent ? `${escapeHtml(lec.sessionCurrent)}/${escapeHtml(lec.sessionTotal)}` : ''}
          </div>
        </td>
        <td>
          <div class="td-date">
            <div class="td-date-main">${main} ${day}요일</div>
          </div>
          <div class="td-time" style="margin-top: 4px; font-size: 0.9em; color: var(--gray-600);">${lec.timeStart}~${lec.timeEnd}</div>
        <td>
          <div class="td-title">${escapeHtml(lec.title)}</div>
          <div class="td-title-sub">${escapeHtml(lec.topic || '')}</div>
        </td>
        <td class="td-client">${escapeHtml(lec.client)}</td>
        <td class="td-place col-place">${escapeHtml(lec.place || '')}${lec.classroom ? `<span class="td-place-room"> (${escapeHtml(lec.classroom)})</span>` : ''}</td>
        <td class="td-fee col-fee">₩${(Number(lec.fee)*10000 || 0).toLocaleString()}</td>
        <td class="col-status"><span class="lec-badge ${meta.cls}">${meta.label}</span></td>
      </tr>`;
  }).join('');

  _renderPagination(list.length);

  tableBody.querySelectorAll('tr[data-id]').forEach(row => {
    row.querySelector('.row-cb')?.addEventListener('change', e => {
      e.stopPropagation();
      const id = row.dataset.id;
      if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
      _updateBatchBar();
      const visible  = getFilteredLectures();
      const allChk   = visible.length > 0 && visible.every(l => selectedIds.has(l.id));
      const someChk  = visible.some(l => selectedIds.has(l.id));
      const saCb     = document.getElementById('select-all-cb');
      if (saCb) { saCb.checked = allChk; saCb.indeterminate = !allChk && someChk; }
    });
    row.addEventListener('click',   e => { if (e.target.type === 'checkbox') return; openModal(row.dataset.id); });
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
    _currentPage = 0;
    renderTable();
  });
});

/* ════════════════════════════════════════
   검색
════════════════════════════════════════ */
let _debounceTimer = null;
searchInput?.addEventListener('input', () => {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    searchQuery = searchInput.value.trim();
    _currentPage = 0;
    renderTable();
  }, 300);
});

/*
document.getElementById('search-status')?.addEventListener('change', e => {
  searchStatus = e.target.value;
  renderTable();
});
*/

document.getElementById('search-date-from')?.addEventListener('change', e => {
  dateFrom = e.target.value;
  _currentPage = 0;
  renderTable();
});

document.getElementById('search-date-to')?.addEventListener('change', e => {
  dateTo = e.target.value;
  _currentPage = 0;
  renderTable();
});

document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
  if (searchInput) { searchInput.value = ''; searchQuery = ''; }
  const fromEl = document.getElementById('search-date-from');
  const toEl   = document.getElementById('search-date-to');
  if (fromEl) { fromEl.value = ''; dateFrom = ''; }
  if (toEl)   { toEl.value   = ''; dateTo   = ''; }
  _currentPage = 0;
  _applyFilterTrigger('all');
  renderTable();
});

/* ════════════════════════════════════════
   카테고리 필터 피커
════════════════════════════════════════ */
function _renderFilterOptions() {
  const listEl = document.getElementById('filter-tag-option-list');
  if (!listEl) return;
  const current = filterTagId || 'all';
  const tags    = getTopicTags();

  const allHtml = `<div class="lm-tag-option lm-tag-option-none${current === 'all' ? ' selected' : ''}"
    data-fval="all" role="option" aria-selected="${current === 'all'}">
    <span class="lm-tag-option-dot" style="background:transparent;border-color:transparent"></span>
    <span>전체 카테고리</span>
  </div>`;

  const defaultHtml = `<div class="lm-tag-option${current === 'default' ? ' selected' : ''}"
    data-fval="default" role="option" aria-selected="${current === 'default'}">
    <span class="lm-tag-option-dot" style="background:#fff"></span>
    <span>일반 강의 (태그 없음)</span>
  </div>`;

  const tagsHtml = tags.map(t => `
    <div class="lm-tag-option${String(t.id) === current ? ' selected' : ''}"
         data-fval="${t.id}" role="option" aria-selected="${String(t.id) === current}">
      <span class="lm-tag-option-dot" style="background:${escapeHtml(t.color)}"></span>
      <span>${escapeHtml(t.name)}</span>
    </div>`).join('');

  listEl.innerHTML = allHtml + defaultHtml + tagsHtml;
}

function _applyFilterTrigger(val) {
  const swatchEl = document.getElementById('filter-tag-swatch');
  const labelEl  = document.getElementById('filter-tag-trigger-label');
  const tags     = getTopicTags();

  if (!val || val === 'all') {
    filterTagId = '';
    if (swatchEl) { swatchEl.style.background = 'transparent'; swatchEl.style.borderColor = 'transparent'; }
    if (labelEl)  labelEl.textContent = '전체 카테고리';
  } else if (val === 'default') {
    filterTagId = 'default';
    if (swatchEl) { swatchEl.style.background = '#fff'; swatchEl.style.borderColor = 'rgba(0,0,0,.12)'; }
    if (labelEl)  labelEl.textContent = '일반 강의 (태그 없음)';
  } else {
    filterTagId = val;
    const tag = tags.find(t => String(t.id) === String(val));
    if (swatchEl) { swatchEl.style.background = (tag != null && tag.color != null ? tag.color : '#fff'); swatchEl.style.borderColor = 'rgba(0,0,0,.12)'; }
    if (labelEl)  labelEl.textContent = (tag != null && tag.name != null ? tag.name : '');
  }

  document.querySelectorAll('#filter-tag-option-list .lm-tag-option').forEach(el => {
    const match = el.dataset.fval === (filterTagId || 'all');
    el.classList.toggle('selected', match);
    el.setAttribute('aria-selected', String(match));
  });
}

function _openFilterPanel() {
  const trigger = document.getElementById('filter-tag-trigger');
  const panel   = document.getElementById('filter-tag-panel');
  if (!trigger || !panel) return;
  _renderFilterOptions();
  positionPanel(trigger, panel);
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
}

function _closeFilterPanel() {
  const panel   = document.getElementById('filter-tag-panel');
  const trigger = document.getElementById('filter-tag-trigger');
  if (!panel) return;
  panel.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
}

function _initFilterPicker() {
  _renderFilterOptions();
  _applyFilterTrigger('all');

  const trigger = document.getElementById('filter-tag-trigger');
  const panel   = document.getElementById('filter-tag-panel');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden ? _openFilterPanel() : _closeFilterPanel();
  });

  document.getElementById('filter-tag-option-list')?.addEventListener('click', e => {
    const opt = e.target.closest('.lm-tag-option');
    if (!opt) return;
    _applyFilterTrigger(opt.dataset.fval);
    _closeFilterPanel();
    renderTable();
  });

  panel.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => { if (panel && !panel.hidden) _closeFilterPanel(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel && !panel.hidden) _closeFilterPanel();
  });
}

/* ════════════════════════════════════════
   일괄 처리 — 칩 렌더링 헬퍼 (준비물)
════════════════════════════════════════ */
function _renderBmChips() {
  const list = document.getElementById('bm-supplies-chip-list');
  if (!list) return;
  list.innerHTML = _bmSupplies.map(item =>
    `<span class="supplies-chip" data-id="${item.id}">` +
    `${escapeHtml(item.name)}` +
    `<button type="button" class="supplies-chip-remove" data-id="${item.id}" aria-label="삭제">×</button>` +
    `</span>`
  ).join('');
}

function _renderBmPresets() {
  const wrap = document.getElementById('bm-supplies-presets-wrap');
  const list = document.getElementById('bm-supplies-presets-list');
  if (!wrap || !list) return;
  if (_bmPresets.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  list.innerHTML = _bmPresets.map(item =>
    `<label class="supplies-preset-item${item.included ? ' is-checked' : ''}" data-preset-id="${item.id}">` +
    `<input type="checkbox" class="supplies-preset-cb" data-preset-id="${item.id}" ${item.included ? 'checked' : ''} />` +
    `<span>${escapeHtml(item.name)}</span></label>`
  ).join('');
}

/* ════════════════════════════════════════
   일괄 처리 — 초기화 (바 이벤트 + 모달 이벤트)
════════════════════════════════════════ */
function _initBatchBar() {
  document.getElementById('btn-batch-edit')?.addEventListener('click', _openBatchModal);
  document.getElementById('btn-batch-seq')?.addEventListener('click', _runSeqOnly);
  document.getElementById('btn-batch-clear')?.addEventListener('click', _clearSelection);
}

function _initBatchModal() {
  const bd = document.getElementById('bm-backdrop');
  if (!bd) return;

  document.getElementById('bm-x').addEventListener('click', _closeBatchModal);
  document.getElementById('bm-cancel').addEventListener('click', _closeBatchModal);
  bd.addEventListener('click', e => { if (e.target === bd) _closeBatchModal(); });

  bd.querySelectorAll('.bm-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.id === 'bm-cb-supplies') {
        const section = document.getElementById('bm-supplies-section');
        if (section) {
          section.style.opacity = cb.checked ? '1' : '0.5';
          section.style.pointerEvents = cb.checked ? '' : 'none';
          if (cb.checked) document.getElementById('bm-supplies-input')?.focus();
        }
        return;
      }
      const inputId = cb.id.replace('bm-cb-', 'bm-');
      const el = document.getElementById(inputId);
      if (el) el.disabled = !cb.checked;
      if (cb.id === 'bm-cb-place') {
        document.getElementById('bm-addr-search').disabled = !cb.checked;
      }
      if (cb.id === 'bm-cb-overnight') {
        const flagCb  = document.getElementById('bm-overnight-flag');
        const endDate = document.getElementById('bm-end-date');
        if (flagCb)  flagCb.disabled  = !cb.checked;
        if (endDate) endDate.disabled = !cb.checked;
      }
    });
  });

  document.getElementById('bm-online')?.addEventListener('change', e => {
    const placeEl = document.getElementById('bm-place');
    const addrBtn = document.getElementById('bm-addr-search');
    const placeCb = document.getElementById('bm-cb-place');
    if (e.target.checked) {
      if (placeEl) { placeEl.value = ''; placeEl.disabled = true; }
      if (addrBtn) addrBtn.disabled = true;
      if (placeCb && !placeCb.checked) placeCb.checked = true;
    } else {
      const enabled = (placeCb != null ? placeCb.checked : false);
      if (placeEl) placeEl.disabled = !enabled;
      if (addrBtn) addrBtn.disabled = !enabled;
    }
  });

  document.getElementById('bm-paid')?.addEventListener('change', e => {
    const taxSel = document.getElementById('bm-tax');
    if (!taxSel) return;
    if (e.target.value === 'na') {
      taxSel.value    = 'na';
      taxSel.disabled = true;
    } else {
      if (document.getElementById('bm-cb-tax')?.checked) taxSel.disabled = false;
    }
  });

  const _syncDuration = () => {
    const s  = document.getElementById('bm-timeStart')?.value;
    const e  = document.getElementById('bm-timeEnd')?.value;
    const el = document.getElementById('bm-duration');
    if (el) el.value = (s && e && s < e) ? calcDuration(s, e) : '';
  };
  document.getElementById('bm-timeStart')?.addEventListener('change', _syncDuration);
  document.getElementById('bm-timeEnd')?.addEventListener('change', _syncDuration);

  document.getElementById('bm-addr-search').addEventListener('click', () => openKakaoAddress('bm-place'));

  document.getElementById('bm-tag')?.addEventListener('change', e => {
    const tagId = e.target.value === '' ? null : Number(e.target.value);
    const defs = getTopicDefaultSupplies(tagId);
    _bmPresets = defs.map((d, i) => ({ id: i + 1, name: d.name, included: true }));
    _renderBmPresets();
  });

  document.getElementById('bm-supplies-presets-list')?.addEventListener('change', e => {
    const cb = e.target.closest('.supplies-preset-cb');
    if (!cb) return;
    const presetId = Number(cb.dataset.presetId);
    const preset = _bmPresets.find(p => p.id === presetId);
    if (preset) {
      preset.included = cb.checked;
      cb.closest('.supplies-preset-item')?.classList.toggle('is-checked', cb.checked);
    }
  });

  document.getElementById('bm-supplies-wrap')?.addEventListener('click', e => {
    const removeBtn = e.target.closest('.supplies-chip-remove');
    if (removeBtn) {
      const idStr = removeBtn.dataset.id;
      _bmSupplies = _bmSupplies.filter(s => String(s.id) !== idStr);
      _renderBmChips();
      return;
    }
    document.getElementById('bm-supplies-input')?.focus();
  });
  document.getElementById('bm-supplies-input')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = e.target.value.trim();
    if (!name) return;
    _bmSupplies.push({ id: Date.now(), name, isChecked: false });
    _renderBmChips();
    e.target.value = '';
  });

  document.getElementById('bm-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('bm-apply');
    applyBtn.disabled = true; applyBtn.textContent = '적용 중...';
    try {
      const payload = {};
      const get     = function(id) { var _e = document.getElementById(id); return (_e != null && _e.value != null ? _e.value : ''); };
      const checked = function(id) { var _e = document.getElementById(id); return (_e != null ? !!_e.checked : false); };

      if (checked('bm-cb-title'))     payload.title        = get('bm-title').trim();
      if (checked('bm-cb-memo'))      payload.memo         = get('bm-memo').trim();
      if (checked('bm-cb-tax'))       payload.taxType      = get('bm-tax');
      if (checked('bm-cb-timeStart')) { payload.timeStart = get('bm-timeStart'); payload.startTime = get('bm-timeStart'); }
      if (checked('bm-cb-timeEnd'))   { payload.timeEnd   = get('bm-timeEnd');   payload.endTime   = get('bm-timeEnd'); }
      if (checked('bm-cb-place'))     payload.place        = get('bm-place').trim();
      if (checked('bm-cb-classroom')) payload.classroom    = get('bm-classroom').trim();
      if (checked('bm-cb-parking'))   payload.parkingInfo  = get('bm-parking').trim();
      if (checked('bm-cb-groupInfo')) payload.groupInfo    = get('bm-groupInfo').trim();
      if (checked('bm-cb-client'))    payload.client       = get('bm-client').trim();
      if (checked('bm-cb-mgrName'))   payload.managerName  = get('bm-mgrName').trim();
      if (checked('bm-cb-mgrPhone'))  payload.managerPhone = get('bm-mgrPhone').trim();
      if (checked('bm-cb-mgrEmail'))  payload.managerEmail = get('bm-mgrEmail').trim();
      if (checked('bm-cb-supplies')) {
        const _included = _bmPresets.filter(p => p.included);
        payload.supplies = [
          ..._included.map((p, i) => ({ id: i + 1, name: p.name, isChecked: false })),
          ..._bmSupplies.map((s, j) => ({ id: _included.length + j + 1, name: s.name, isChecked: false })),
        ];
      }

      if (checked('bm-cb-tag')) {
        const v = get('bm-tag');
        payload.topicTagId = v === '' ? null : Number(v);
      }

      if (checked('bm-cb-setupTime'))    { const v = get('bm-setupTime');    if (v !== '') payload.setupTime    = Number(v); }
      if (checked('bm-cb-wrapupTime'))   { const v = get('bm-wrapupTime');   if (v !== '') payload.wrapupTime   = Number(v); }
      if (checked('bm-cb-participants')) { const v = get('bm-participants'); if (v !== '') payload.participants = Number(v); }
      if (checked('bm-cb-fee'))          { const v = get('bm-fee');          if (v !== '') payload.fee          = Number(v); }

      if (checked('bm-cb-feeType'))         { const v = get('bm-feeType');         if (v) payload.feeType         = v; }
      if (checked('bm-cb-settlementCycle')) { const v = get('bm-settlementCycle'); if (v) payload.settlementCycle = v; }

      if (checked('bm-cb-progress')) payload.progressStatus = get('bm-progress');
      if (checked('bm-cb-paid')) {
        const _bmpv  = get('bm-paid');
        payload.isPaid      = _bmpv === 'true';
        payload.paidStatus  = _bmpv;
        if (_bmpv === 'na') payload.taxType = 'na';
      }

      if (checked('bm-cb-place')) {
        var _bmOnline = document.getElementById('bm-online'); const isOnline = (_bmOnline != null ? _bmOnline.checked : false);
        payload.isOnline = isOnline;
        payload.place    = isOnline ? 'Online' : get('bm-place').trim();
      }

      if (checked('bm-cb-overnight')) {
        var _bmOvernight = document.getElementById('bm-overnight-flag'); const isOvernight = (_bmOvernight != null ? _bmOvernight.checked : false);
        payload.isOvernight = isOvernight;
        payload.endDate     = isOvernight ? (get('bm-end-date') || null) : null;
      }

      if (payload.timeStart && payload.timeEnd && payload.timeEnd <= payload.timeStart) {
        window.showToast?.('종료 시간은 시작 시간보다 이후여야 합니다.', 'error');
        applyBtn.disabled = false; applyBtn.textContent = '적용하기';
        return;
      }

      const timeOrLocChanged = checked('bm-cb-timeStart') || checked('bm-cb-timeEnd') || checked('bm-cb-place');
      if (timeOrLocChanged) {
        const conflicts = _detectBatchConflicts((payload.timeStart != null ? payload.timeStart : null), (payload.timeEnd != null ? payload.timeEnd : null));
        if (conflicts.length > 0) {
          const names = conflicts.slice(0, 3).map(l => l.title || '(제목 없음)').join(', ');
          const more  = conflicts.length > 3 ? ` 외 ${conflicts.length - 3}건` : '';
          if (!confirm(`⚠️ 일정 충돌 감지 (${conflicts.length}건)\n\n${names}${more}\n\n충돌을 무시하고 저장하시겠습니까?`)) {
            applyBtn.disabled = false; applyBtn.textContent = '적용하기';
            return;
          }
        }
      }

      var _bmSeq = document.getElementById('bm-seq-cb'); const doSeq   = (_bmSeq   != null ? _bmSeq.checked   : false);
      var _bmGrp = document.getElementById('bm-group-cb'); const doGroup = (_bmGrp != null ? _bmGrp.checked : false);

      let seqUpdates = doSeq ? _computeSeqUpdates() : {};

      if (doGroup) {
        const newGroupId = 'GRP-' + Date.now();
        payload.groupId = newGroupId;
        const groupedLecs = [...selectedIds]
          .map(id => allLectures.find(l => l.id === id))
          .filter(Boolean)
          .sort((a, b) => {
            const d = a.date.localeCompare(b.date);
            return d !== 0 ? d : (a.timeStart != null ? a.timeStart : '').localeCompare(b.timeStart != null ? b.timeStart : '');
          });
        const total = groupedLecs.length;
        groupedLecs.forEach((lec, i) => {
          seqUpdates[lec.id] = { ...(seqUpdates[lec.id] != null ? seqUpdates[lec.id] : {}), sessionTotal: total, sessionCurrent: i + 1 };
        });
      }

      if (checked('bm-cb-feeAmount')) {
        const rawTotal = get('bm-feeAmount');
        if (rawTotal !== '') {
          const feeTotal = Number(rawTotal);
          payload.feeAmount = feeTotal;
          if (!checked('bm-cb-fee')) {
            for (const id of selectedIds) {
              const lec = allLectures.find(l => l.id === id);
              const sessionTotal = lec?.sessionTotal || 1;
              seqUpdates[id] = { ...(seqUpdates[id] != null ? seqUpdates[id] : {}), fee: Math.floor(feeTotal / sessionTotal) };
            }
          }
        }
      }

      if (checked('bm-cb-settlementCycle')) {
        const cycle = get('bm-settlementCycle');
        if (cycle) {
          const groupLastDate = new Map();
          if (cycle === 'after-completion') {
            if (doGroup) {
              const lastInSelection = [...selectedIds]
                .map(id => allLectures.find(l => l.id === id))
                .filter(Boolean)
                .reduce((max, l) => { const d = l.endDate || l.date || ''; return d > max ? d : max; }, '');
              groupLastDate.set(payload.groupId, lastInSelection);
            } else {
              for (const id of selectedIds) {
                const gid = allLectures.find(l => l.id === id)?.groupId;
                if (!gid || groupLastDate.has(gid)) continue;
                const lastInGroup = allLectures
                  .filter(l => l.groupId === gid)
                  .reduce((max, l) => { const d = l.endDate || l.date || ''; return d > max ? d : max; }, '');
                groupLastDate.set(gid, lastInGroup);
              }
            }
          }
          for (const id of selectedIds) {
            const lec = allLectures.find(l => l.id === id);
            if (!lec?.date) continue;
            const baseDate = lec.endDate || lec.date;
            let lastDate = null;
            if (cycle === 'after-completion') {
              const gid = doGroup ? payload.groupId : lec.groupId;
              lastDate = (gid ? groupLastDate.get(gid) : null) || baseDate;
            }
            const paymentDate = calcPaymentDate(baseDate, cycle, lastDate);
            seqUpdates[id] = { ...(seqUpdates[id] != null ? seqUpdates[id] : {}), paymentDate };
          }
        }
      }

      if (Object.keys(payload).length === 0 && Object.keys(seqUpdates).length === 0) {
        window.showToast?.('변경할 내용이 없습니다.', 'warn');
        applyBtn.disabled = false; applyBtn.textContent = '적용하기';
        return;
      }

      const savedCount = selectedIds.size;
      await _executeBatch(payload, seqUpdates);
      window.showToast?.(
        doGroup
          ? `${savedCount}건이 그룹(${payload.groupId})으로 묶였습니다.`
          : `${savedCount}건이 수정되었습니다.`,
        'success'
      );
      _closeBatchModal();
      _clearSelection();
    } catch (err) {
      console.error('[강비서] 일괄 수정 오류:', err);
      window.showToast?.('수정에 실패했습니다.', 'error');
      applyBtn.disabled = false; applyBtn.textContent = '적용하기';
    }
  });
}

function _updateBatchBar() {
  const bar = document.getElementById('batch-action-bar');
  if (!bar) return;
  const n = selectedIds.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  const lbl = document.getElementById('batch-count-label');
  if (lbl) lbl.textContent = `${n}개 선택됨`;
}

function _clearSelection() {
  selectedIds.clear();
  tableBody.querySelectorAll('.row-cb').forEach(cb => { cb.checked = false; });
  const saCb = document.getElementById('select-all-cb');
  if (saCb) { saCb.checked = false; saCb.indeterminate = false; }
  _updateBatchBar();
}

/* ════════════════════════════════════════
   일괄 처리 — 회차 시퀀싱
════════════════════════════════════════ */
function _computeSeqUpdates() {
  const groupIds = new Set();
  for (const id of selectedIds) {
    const lec = allLectures.find(l => l.id === id);
    if (lec?.groupId) groupIds.add(lec.groupId);
  }

  const updates = {};
  for (const gid of groupIds) {
    const inGroup = allLectures
      .filter(l => l.groupId === gid)
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        return d !== 0 ? d : (a.timeStart != null ? a.timeStart : '').localeCompare(b.timeStart != null ? b.timeStart : '');
      });
    const total = inGroup.length;
    inGroup.forEach((lec, i) => {
      updates[lec.id] = { sessionTotal: total, sessionCurrent: i + 1 };
    });
  }
  return updates;
}

/* ════════════════════════════════════════
   일괄 처리 — writeBatch 실행
════════════════════════════════════════ */
async function _executeBatch(commonPayload, seqUpdates) {
  const merged = new Map();
  if (Object.keys(commonPayload).length > 0) {
    for (const id of selectedIds) merged.set(id, { ...commonPayload });
  }
  for (const [id, upd] of Object.entries(seqUpdates)) {
    merged.set(id, { ...(merged.get(id) != null ? merged.get(id) : {}), ...upd });
  }
  if (merged.size === 0) return;

  const batch = writeBatch(db);
  for (const [id, upd] of merged) {
    batch.update(doc(db, 'lectures', id), upd);
  }
  await batch.commit();
}

/* ════════════════════════════════════════
   일괄 처리 — 회차 전용 버튼
════════════════════════════════════════ */
async function _runSeqOnly() {
  const updates = _computeSeqUpdates();
  if (Object.keys(updates).length === 0) {
    window.showToast?.('선택된 강의 중 그룹 ID가 있는 강의가 없습니다.', 'warn');
    return;
  }
  try {
    await _executeBatch({}, updates);
    window.showToast?.(`${Object.keys(updates).length}건의 회차가 설정되었습니다.`, 'success');
    _clearSelection();
  } catch (err) {
    console.error('[강비서] 회차 설정 오류:', err);
    window.showToast?.('회차 설정에 실패했습니다.', 'error');
  }
}

/* ════════════════════════════════════════
   일괄 처리 — 수정 모달 열기 (동적 상태 갱신)
════════════════════════════════════════ */
function _openBatchModal() {
  const bd = document.getElementById('bm-backdrop');
  if (!bd) return;

  const hasGroup = [...selectedIds].some(id => allLectures.find(l => l.id === id)?.groupId);
  const tags = getTopicTags();

  // Update heading with current selection count
  const heading = document.getElementById('bm-heading');
  if (heading) heading.textContent = `✏️ 일괄 수정 (${selectedIds.size}건)`;

  // Update group count label
  const groupSub = document.getElementById('bm-group-sub');
  if (groupSub) groupSub.textContent = `선택한 ${selectedIds.size}건에 공유 그룹 ID를 부여합니다. 회차도 자동 설정됩니다.`;

  // Show/hide seq section
  const seqSection = document.getElementById('bm-seq-section');
  if (seqSection) seqSection.style.display = hasGroup ? '' : 'none';

  // Populate tag options
  const tagSel = document.getElementById('bm-tag');
  if (tagSel) {
    tagSel.innerHTML = `<option value="">일반 강의</option>` +
      tags.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  }

  // Populate time options
  const _mkTimeOpts = () => {
    const opts = ['<option value="">선택</option>'];
    for (let h = 7; h <= 22; h++) {
      for (let m = 0; m < 60; m += 10) {
        if (h === 22 && m > 0) break;
        const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        opts.push(`<option value="${t}">${t}</option>`);
      }
    }
    return opts.join('');
  };
  const timeOpts = _mkTimeOpts();
  const startSel = document.getElementById('bm-timeStart');
  const endSel   = document.getElementById('bm-timeEnd');
  if (startSel) startSel.innerHTML = timeOpts;
  if (endSel)   endSel.innerHTML   = timeOpts;

  // Reset checkboxes/inputs to initial state
  bd.querySelectorAll('.bm-cb').forEach(cb => {
    cb.checked = false;
    if (cb.id === 'bm-cb-supplies') {
      const section = document.getElementById('bm-supplies-section');
      if (section) { section.style.opacity = '0.5'; section.style.pointerEvents = 'none'; }
      return;
    }
    const inputId = cb.id.replace('bm-cb-', 'bm-');
    const el = document.getElementById(inputId);
    if (el) el.disabled = true;
    if (cb.id === 'bm-cb-place') {
      const addrBtn = document.getElementById('bm-addr-search');
      if (addrBtn) addrBtn.disabled = true;
    }
    if (cb.id === 'bm-cb-overnight') {
      const flagCb  = document.getElementById('bm-overnight-flag');
      const endDate = document.getElementById('bm-end-date');
      if (flagCb)  flagCb.disabled  = true;
      if (endDate) endDate.disabled = true;
    }
  });
  _bmSupplies = [];
  _renderBmChips();
  _bmPresets = [];
  _renderBmPresets();
  const seqCb  = document.getElementById('bm-seq-cb');
  const grpCb  = document.getElementById('bm-group-cb');
  const online = document.getElementById('bm-online');
  const niteF  = document.getElementById('bm-overnight-flag');
  const durEl  = document.getElementById('bm-duration');
  if (seqCb)  seqCb.checked  = false;
  if (grpCb)  grpCb.checked  = false;
  if (online) online.checked  = false;
  if (niteF)  niteF.checked   = false;
  if (durEl)  durEl.value     = '';

  requestAnimationFrame(() => bd.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function _closeBatchModal() {
  const bd = document.getElementById('bm-backdrop');
  if (!bd) return;
  bd.classList.remove('open');
  document.body.style.overflow = '';
}

function _detectBatchConflicts(newStart, newEnd) {
  const hits = [];
  for (const id of selectedIds) {
    const lec = allLectures.find(l => l.id === id);
    if (!lec) continue;
    const s = newStart || lec.timeStart;
    const e = newEnd   || lec.timeEnd;
    if (!s || !e) continue;
    const nS = timeToMin(s), nE = timeToMin(e);
    if (nE <= nS) continue;
    const sameDay = allLectures.filter(l =>
      l.date === lec.date && !selectedIds.has(l.id) && l.progressStatus !== 'cancelled'
    );
    for (const other of sameDay) {
      if (!other.timeStart || !other.timeEnd) continue;
      const oS = timeToMin(other.timeStart), oE = timeToMin(other.timeEnd);
      if (Math.max(nS, oS) < Math.min(nE, oE)) { hits.push(lec); break; }
    }
  }
  return hits;
}

/* ════════════════════════════════════════
   Firestore 실시간 구독
════════════════════════════════════════ */
function initLectures(uid) {
  // Show cached data instantly while waiting for Firestore
  const cached = getLectureCache(uid);
  if (cached && cached.length > 0) {
    allLectures = cached.map(d => ({ ...d, _status: classifyStatus(d) }));
    _isLoading  = false;
    updateTabCounts();
    updateSummaryChips();
    updateNavBadge();
    renderTable();
  }

  if (unsubLectures) unsubLectures();
  unsubLectures = subscribeLectures(uid, snapshot => {
    allLectures = snapshot.docs
      .map(d => { const data = d.data(); return { id: d.id, ...data, _status: classifyStatus(data) }; })
      .sort((a, b) => a.date.localeCompare(b.date));

    /* 🚨 파이어베이스 실시간 데이터가 들어올 때마다 브라우저 콘솔에 표를 그립니다.
    console.log("========== 🚨 DB 실시간 데이터 topicTagId 전수 조사 ==========");
    console.table(allLectures.map(lec => ({
      "강의명": lec.title || "제목 없음",
      "날짜": lec.date,
      "강의 고유 ID": lec.id,
      "DB에 저장된 tagId": lec.topicTagId === null ? "null (일반강의)" : lec.topicTagId
    })));
    */
   
    _isLoading = false;
    setLectureCache(uid, allLectures);
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
_initBatchBar();
_initBatchModal();

document.getElementById('select-all-cb')?.addEventListener('change', e => {
  const visible = getFilteredLectures();
  visible.forEach(l => { if (e.target.checked) selectedIds.add(l.id); else selectedIds.delete(l.id); });
  tableBody.querySelectorAll('.row-cb').forEach(cb => { cb.checked = e.target.checked; });
  _updateBatchBar();
});

/* ════════════════════════════════════════
   인증 상태 감지
════════════════════════════════════════ */
authGuard(async user => {
  currentUser = user;
  await initLectureModal(() => ({ allLectures, currentUser }));
  _initFilterPicker();
  initMultiSessionModal(() => ({ allLectures, currentUser }));
  initLectures(user.uid);

  document.getElementById('btn-multi-lecture')?.addEventListener('click', () => {
    openMultiSessionModal();
  });
}, {
  withModal: true,
  cleanupFn: () => unsubLectures?.(),
});
