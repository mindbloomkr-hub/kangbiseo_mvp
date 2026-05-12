// js/pages/lectures.js — 강의 관리 (Firebase 연동, ES Module)

import { subscribeLectures, authGuard, db } from '../api.js';
import { writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { TODAY, STATUS_META, escapeHtml, formatDateKo, classifyStatus, positionPanel, calcDuration, timeToMin, formatDateString, calcPaymentDate } from '../utils.js';
import { openKakaoAddress } from '../services/kakaoAddressService.js';
import { initLectureModal, openModal, getTopicTags } from '../components/lectureModal.js';
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
function renderTable() {
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
    return;
  }

  tableBody.innerHTML = list.map(lec => {
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
  renderTable();
});

document.getElementById('search-date-to')?.addEventListener('change', e => {
  dateTo = e.target.value;
  renderTable();
});

document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
  if (searchInput) { searchInput.value = ''; searchQuery = ''; }
  const fromEl = document.getElementById('search-date-from');
  const toEl   = document.getElementById('search-date-to');
  if (fromEl) { fromEl.value = ''; dateFrom = ''; }
  if (toEl)   { toEl.value   = ''; dateTo   = ''; }
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
  positionPanel(trigger, panel, { alignLeft: true });
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
   일괄 처리 — CSS 주입
════════════════════════════════════════ */
function _injectBatchStyles() {
  if (document.getElementById('lm-batch-styles')) return;
  const s = document.createElement('style');
  s.id = 'lm-batch-styles';
  s.textContent = `
.col-cb{width:36px;text-align:center!important;padding:0 8px!important}
.row-cb-wrap{display:flex;justify-content:center;align-items:center}
input[type=checkbox].row-cb,input[type=checkbox]#select-all-cb{width:16px;height:16px;cursor:pointer;accent-color:#2563eb}
.batch-bar{display:flex;align-items:center;gap:10px;padding:10px 0 2px;flex-wrap:wrap}
.batch-bar-label{font-size:13px;font-weight:700;color:#1e293b}
.batch-btn{padding:6px 14px;border-radius:8px;font-size:13px;font-weight:700;border:none;cursor:pointer;transition:background .15s}
.batch-btn--edit{background:#2563eb;color:#fff}.batch-btn--edit:hover{background:#1d4ed8}
.batch-btn--seq{background:#7c3aed;color:#fff}.batch-btn--seq:hover{background:#6d28d9}
.batch-btn--clear{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}.batch-btn--clear:hover{background:#e2e8f0}
.bm-bd{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .2s}
.bm-bd.open{opacity:1;pointer-events:auto}
.bm-modal{background:#fff;border-radius:18px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.bm-head{background:#2563eb;padding:16px 20px;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center}
.bm-head h2{color:#fff;font-size:16px;font-weight:800;margin:0}
.bm-x{background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;padding:2px 8px;border-radius:6px}
.bm-x:hover{color:#fff;background:rgba(255,255,255,.15)}
.bm-body{padding:20px}
.bm-hint{font-size:12px;color:#64748b;margin:0 0 14px}
.bm-field{margin-bottom:14px}
.bm-label{font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:4px}
.bm-input,.bm-select{width:100%;height:38px;border:1px solid #e2e8f0;border-radius:9px;padding:0 12px;font-size:14px;color:#1e293b;background:#f8fafc;outline:none;box-sizing:border-box}
.bm-input:focus,.bm-select:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,196,.1)}
.bm-divider{border:none;border-top:1px dashed #e2e8f0;margin:16px 0}
.bm-seq-row{display:flex;align-items:center;gap:12px;padding:12px;background:#f0f4ff;border-radius:10px;border:1.5px solid #bfdbfe}
.bm-seq-label{font-size:13px;font-weight:700;color:#1e40af;flex:1}
.bm-seq-sub{font-size:11px;color:#3b82f6;display:block;margin-top:2px}
.bm-foot{padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;gap:10px}
.bm-foot-btn{flex:1;padding:12px;border-radius:10px;font-size:14px;font-weight:800;border:none;cursor:pointer;transition:background .15s}
.bm-foot-btn:disabled{opacity:.45;cursor:not-allowed}
.bm-foot-btn--cancel{background:#f1f5f9;color:#475569}.bm-foot-btn--cancel:hover:not(:disabled){background:#e2e8f0}
.bm-foot-btn--apply{background:#2563eb;color:#fff}.bm-foot-btn--apply:hover:not(:disabled){background:#1d4ed8}
.bm-group-row{display:flex;align-items:center;gap:12px;padding:12px;background:#f0fdf4;border-radius:10px;border:1.5px solid #bbf7d0}
.bm-group-label{font-size:13px;font-weight:700;color:#065f46;flex:1}
.bm-group-sub{font-size:11px;color:#10b981;display:block;margin-top:2px}
.bm-addr-wrap{display:flex;gap:6px;align-items:stretch}
.bm-addr-btn{height:38px;padding:0 12px;white-space:nowrap;background:#6bb2f5;border:1.5px solid #5eadf8;border-radius:9px;font-size:12px;font-weight:700;color:#3c1e1e;cursor:pointer;flex-shrink:0;transition:opacity .15s;outline:none}
.bm-addr-btn:hover{opacity:.85}
.bm-addr-btn:disabled{opacity:.4;cursor:not-allowed}
.filter-tag-picker{position:relative;display:inline-flex}
.filter-tag-picker .lm-tag-trigger{width:160px;height:36px;font-size:13px}
#filter-tag-panel{transform:none!important}
.bm-section-title{font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin:16px 0 8px;padding-bottom:5px;border-bottom:1px solid #e2e8f0}
.bm-field--cb{margin-bottom:10px}
.bm-cb-row{display:flex;align-items:center;gap:7px;margin-bottom:4px}
.bm-cb{width:15px;height:15px;cursor:pointer;accent-color:#2563eb;flex-shrink:0}
.bm-field--cb .bm-label{margin-bottom:0;color:#374151;font-size:12px;font-weight:700}
.bm-input:disabled,.bm-select:disabled{opacity:.4;cursor:not-allowed;background:#f1f5f9}
textarea.bm-input{height:auto;padding:8px 12px;resize:vertical;min-height:60px;line-height:1.45;font-family:inherit}
.bm-field--computed{margin-bottom:10px}
.bm-input--computed{background:#f0f9ff!important;color:#0369a1;font-weight:700;border-color:#bae6fd;cursor:default}
  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════
   일괄 처리 — 액션 바
════════════════════════════════════════ */
function _injectBatchBar() {
  const toolbar = document.querySelector('.table-toolbar');
  if (!toolbar || document.getElementById('batch-action-bar')) return;
  const bar = document.createElement('div');
  bar.id        = 'batch-action-bar';
  bar.className = 'batch-bar';
  bar.style.display = 'none';
  bar.innerHTML = `
    <span class="batch-bar-label" id="batch-count-label">0개 선택됨</span>
    <button class="batch-btn batch-btn--edit" id="btn-batch-edit">✏️ 일괄 수정</button>
    <button class="batch-btn batch-btn--seq"  id="btn-batch-seq">🔢 회차 자동 설정</button>
    <button class="batch-btn batch-btn--clear" id="btn-batch-clear">✕ 선택 해제</button>
  `;
  toolbar.appendChild(bar);
  document.getElementById('btn-batch-edit').addEventListener('click', _openBatchModal);
  document.getElementById('btn-batch-seq').addEventListener('click', _runSeqOnly);
  document.getElementById('btn-batch-clear').addEventListener('click', _clearSelection);
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
   일괄 처리 — 수정 모달
════════════════════════════════════════ */
function _openBatchModal() {
  document.getElementById('bm-backdrop')?.remove();
  const hasGroup = [...selectedIds].some(id => allLectures.find(l => l.id === id)?.groupId);
  const tags = getTopicTags();

  const _mkTagOpts = () =>
    `<option value="">일반 강의</option>` +
    tags.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

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

  const _cf = (cbId, label, inputHtml) => {
    const inputId = cbId.replace('bm-cb-', 'bm-');
    return `
    <div class="bm-field bm-field--cb">
      <div class="bm-cb-row">
        <input type="checkbox" class="bm-cb" id="${cbId}">
        <label class="bm-label" for="${inputId}">${label}</label>
      </div>
      ${inputHtml}
    </div>`;
  };

  const bd = document.createElement('div');
  bd.id = 'bm-backdrop';
  bd.className = 'bm-bd';
  bd.innerHTML = `
    <div class="bm-modal">
      <div class="bm-head">
        <h2>✏️ 일괄 수정 (${selectedIds.size}건)</h2>
        <button class="bm-x" id="bm-x">✕</button>
      </div>
      <div class="bm-body">
        <p class="bm-hint">✅ 체크한 항목만 변경됩니다. 체크하지 않은 항목은 기존 값을 유지합니다.</p>

        <p class="bm-section-title">강의 기본 정보</p>
        ${_cf('bm-cb-tag', '카테고리', `<select class="bm-select" id="bm-tag" disabled>${_mkTagOpts()}</select>`)}
        ${_cf('bm-cb-progress', '진행 상태', `<select class="bm-select" id="bm-progress" disabled>
          <option value="discussing">논의 중</option>
          <option value="scheduled">진행 예정</option>
          <option value="done">진행 완료</option>
          <option value="onhold">보류 중</option>
          <option value="cancelled">취소/드롭</option>
          <option value="needs_review">확인 필요</option>
        </select>`)}

        ${_cf('bm-cb-title', '강의명', `<input class="bm-input" type="text" id="bm-title" placeholder="강의명" disabled>`)}

        ${_cf('bm-cb-timeStart', '시작 시간', `<select class="bm-select" id="bm-timeStart" disabled>${timeOpts}</select>`)}
        ${_cf('bm-cb-timeEnd', '종료 시간', `<select class="bm-select" id="bm-timeEnd" disabled>${timeOpts}</select>`)}
        <div class="bm-field bm-field--computed">
          <label class="bm-label">강의 시간 (자동 계산)</label>
          <input class="bm-input bm-input--computed" type="text" id="bm-duration" readonly placeholder="—">
        </div>

        <p class="bm-section-title">정산 정보</p>
        ${_cf('bm-cb-feeType', '정산 방식', `<select class="bm-select" id="bm-feeType" disabled>
          <option value="">선택</option>
          <option value="fixed">고정 금액 (전체)</option>
          <option value="unit">회당 금액</option>
        </select>`)}

        ${_cf('bm-cb-settlementCycle', '정산 주기', `<select class="bm-select" id="bm-settlementCycle" disabled>
          <option value="per-session">회차별 정산</option>
          <option value="monthly">월 정산</option>
          <option value="quarterly">분기 정산</option>
          <option value="after-completion">완강 후 정산</option>
          <option value="other">기타</option>
        </select>`)}        
        ${_cf('bm-cb-fee', '회차별 강사료 (만원)', `<input class="bm-input" type="number" id="bm-fee" placeholder="숫자만 입력" disabled>`)}
        ${_cf('bm-cb-feeAmount', '강사료 총 금액 (만원)', `<input class="bm-input" type="number" id="bm-feeAmount" placeholder="숫자만 입력" disabled>`)}
        ${_cf('bm-cb-paid', '정산 상태', `<select class="bm-select" id="bm-paid" disabled>
          <option value="true">✅ 입금 완료</option>
          <option value="false">❌ 미입금</option>
          <option value="na">— 해당없음</option>
        </select>`)}

        ${_cf('bm-cb-tax', '세금 유형', `<select class="bm-select" id="bm-tax" disabled>
          <option value="income3_3">사업소득 3.3%</option>
          <option value="income8_8">기타소득 8.8%</option>
          <option value="exempt">면세</option>
          <option value="other">기타</option>
          <option value="na">해당없음</option>
        </select>`)}

        <p class="bm-section-title">고객 정보</p>

        ${_cf('bm-cb-client', '고객사', `<input class="bm-input" type="text" id="bm-client" placeholder="고객사명" disabled>`)}
        <p class="bm-section-title">장소</p>
        <div class="bm-field bm-field--cb">
          <div class="bm-cb-row" style="justify-content:space-between">
            <div style="display:flex;align-items:center;gap:7px">
              <input type="checkbox" class="bm-cb" id="bm-cb-place">
              <label class="bm-label" for="bm-place" style="margin-bottom:0">강의장 주소</label>
            </div>
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#2563eb;cursor:pointer;user-select:none">
              <input type="checkbox" id="bm-online" style="width:14px;height:14px;accent-color:#2563eb;cursor:pointer" /> 💻 온라인 수업
            </label>
          </div>
          <div class="bm-addr-wrap">
            <input class="bm-input" type="text" id="bm-place" placeholder="강의장 주소 입력" disabled>
            <button type="button" class="bm-addr-btn" id="bm-addr-search" disabled>🔍 주소 검색</button>
          </div>
        </div>

        <p class="bm-section-title">야간 강의</p>
        <div class="bm-field bm-field--cb">
          <div class="bm-cb-row">
            <input type="checkbox" class="bm-cb" id="bm-cb-overnight">
            <label class="bm-label" style="margin-bottom:0">1박 이상 (종료일 설정)</label>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#7c3aed;cursor:pointer;user-select:none">
              <input type="checkbox" id="bm-overnight-flag" disabled style="width:14px;height:14px;accent-color:#7c3aed" /> 🌙 야간 강의로 설정
            </label>
            <input class="bm-input" type="date" id="bm-end-date" disabled style="max-width:180px" />
          </div>
        </div>
        ${_cf('bm-cb-classroom', '강의장 (층·호)', `<input class="bm-input" type="text" id="bm-classroom" placeholder="예) 4층 403호" disabled>`)}
        ${_cf('bm-cb-parking', '주차 정보', `<input class="bm-input" type="text" id="bm-parking" placeholder="주차 안내" disabled>`)}

        <p class="bm-section-title">강의 상세 정보</p>
        ${_cf('bm-cb-setupTime', '현장 준비 시간 (분)', `<input class="bm-input" type="number" id="bm-setupTime" min="0" placeholder="분" disabled>`)}
        ${_cf('bm-cb-wrapupTime', '현장 정리 시간 (분)', `<input class="bm-input" type="number" id="bm-wrapupTime" min="0" placeholder="분" disabled>`)}

        ${_cf('bm-cb-participants', '수강 인원 (명)', `<input class="bm-input" type="number" id="bm-participants" min="1" placeholder="예) 20" disabled>`)}
        ${_cf('bm-cb-groupInfo', '그룹 구성', `<input class="bm-input" type="text" id="bm-groupInfo" placeholder="예) 팀별 5인 4개조" disabled>`)}

        ${_cf('bm-cb-supplies', '준비물', `<textarea class="bm-input" id="bm-supplies" placeholder="준비물" rows="2" disabled></textarea>`)}


        <p class="bm-section-title">담당자 정보</p>
        ${_cf('bm-cb-mgrName', '이름', `<input class="bm-input" type="text" id="bm-mgrName" placeholder="담당자 이름" disabled>`)}
        ${_cf('bm-cb-mgrPhone', '연락처', `<input class="bm-input" type="tel" id="bm-mgrPhone" placeholder="010-0000-0000" disabled>`)}
        ${_cf('bm-cb-mgrEmail', '이메일', `<input class="bm-input" type="email" id="bm-mgrEmail" placeholder="example@email.com" disabled>`)}

        ${_cf('bm-cb-memo', '메모', `<textarea class="bm-input" id="bm-memo" placeholder="메모" rows="2" disabled></textarea>`)}

        ${hasGroup ? `
        <hr class="bm-divider" />
        <div class="bm-seq-row">
          <div>
            <span class="bm-seq-label">🔢 회차 자동 설정</span>
            <span class="bm-seq-sub">같은 그룹의 모든 강의를 날짜·시간순으로 자동 정렬합니다.</span>
          </div>
          <input type="checkbox" id="bm-seq-cb" style="width:18px;height:18px;cursor:pointer;accent-color:#2563eb;flex-shrink:0">
        </div>` : ''}
        <hr class="bm-divider" />
        <div class="bm-group-row">
          <div>
            <span class="bm-group-label">🔗 그룹으로 묶기</span>
            <span class="bm-group-sub">선택한 ${selectedIds.size}건에 공유 그룹 ID를 부여합니다. 회차도 자동 설정됩니다.</span>
          </div>
          <input type="checkbox" id="bm-group-cb" style="width:18px;height:18px;cursor:pointer;accent-color:#10b981;flex-shrink:0">
        </div>
      </div>
      <div class="bm-foot">
        <button class="bm-foot-btn bm-foot-btn--cancel" id="bm-cancel">취소</button>
        <button class="bm-foot-btn bm-foot-btn--apply" id="bm-apply">적용하기</button>
      </div>
    </div>`;

  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('open'));
  document.body.style.overflow = 'hidden';

  document.getElementById('bm-x').addEventListener('click', _closeBatchModal);
  document.getElementById('bm-cancel').addEventListener('click', _closeBatchModal);
  bd.addEventListener('click', e => { if (e.target === bd) _closeBatchModal(); });

  // Checkbox toggles: enable/disable matching input
  bd.querySelectorAll('.bm-cb').forEach(cb => {
    cb.addEventListener('change', () => {
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

  // Online interlock within bm-modal place section
  document.getElementById('bm-online')?.addEventListener('change', e => {
    const placeEl   = document.getElementById('bm-place');
    const addrBtn   = document.getElementById('bm-addr-search');
    const placeCb   = document.getElementById('bm-cb-place');
    if (e.target.checked) {
      if (placeEl) { placeEl.value = ''; placeEl.disabled = true; }
      if (addrBtn) addrBtn.disabled = true;
    } else {
      const enabled = (placeCb != null ? placeCb.checked : false);
      if (placeEl) placeEl.disabled = !enabled;
      if (addrBtn) addrBtn.disabled = !enabled;
    }
  });

  // Paid-status → tax interlock in bm-modal
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

  // Duration auto-calc when either time select changes
  const _syncDuration = () => {
    const s  = document.getElementById('bm-timeStart')?.value;
    const e  = document.getElementById('bm-timeEnd')?.value;
    const el = document.getElementById('bm-duration');
    if (el) el.value = (s && e && s < e) ? calcDuration(s, e) : '';
  };
  document.getElementById('bm-timeStart')?.addEventListener('change', _syncDuration);
  document.getElementById('bm-timeEnd')?.addEventListener('change', _syncDuration);

  document.getElementById('bm-addr-search').addEventListener('click', () => openKakaoAddress('bm-place'));

  document.getElementById('bm-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('bm-apply');
    applyBtn.disabled = true; applyBtn.textContent = '적용 중...';
    try {
      const payload = {};
      const get     = function(id) { var _e = document.getElementById(id); return (_e != null && _e.value != null ? _e.value : ''); };
      const checked = function(id) { var _e = document.getElementById(id); return (_e != null ? !!_e.checked : false); };

      // Text / string fields
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
      if (checked('bm-cb-supplies'))  payload.supplies     = get('bm-supplies').trim();


      // Tag (empty string = no tag → null)
      if (checked('bm-cb-tag')) {
        const v = get('bm-tag');
        payload.topicTagId = v === '' ? null : Number(v);
      }

      // Number fields (skip empty to avoid unintended zero)
      if (checked('bm-cb-setupTime'))    { const v = get('bm-setupTime');    if (v !== '') payload.setupTime    = Number(v); }
      if (checked('bm-cb-wrapupTime'))   { const v = get('bm-wrapupTime');   if (v !== '') payload.wrapupTime   = Number(v); }
      if (checked('bm-cb-participants')) { const v = get('bm-participants'); if (v !== '') payload.participants = Number(v); }
      if (checked('bm-cb-fee'))          { const v = get('bm-fee');          if (v !== '') payload.fee          = Number(v); }

      // Select fields with an empty placeholder — skip when unselected
      if (checked('bm-cb-feeType'))         { const v = get('bm-feeType');         if (v) payload.feeType         = v; }
      if (checked('bm-cb-settlementCycle')) { const v = get('bm-settlementCycle'); if (v) payload.settlementCycle = v; }

      // Required-value selects (all options have real values)
      if (checked('bm-cb-progress')) payload.progressStatus = get('bm-progress');
      if (checked('bm-cb-paid')) {
        const _bmpv  = get('bm-paid');
        payload.isPaid      = _bmpv === 'true';
        payload.paidStatus  = _bmpv;
        if (_bmpv === 'na') payload.taxType = 'na';
      }

      // Online / place
      if (checked('bm-cb-place')) {
        var _bmOnline = document.getElementById('bm-online'); const isOnline = (_bmOnline != null ? _bmOnline.checked : false);
        payload.isOnline = isOnline;
        payload.place    = isOnline ? 'Online' : get('bm-place').trim();
      }

      // Overnight
      if (checked('bm-cb-overnight')) {
        var _bmOvernight = document.getElementById('bm-overnight-flag'); const isOvernight = (_bmOvernight != null ? _bmOvernight.checked : false);
        payload.isOvernight = isOvernight;
        payload.endDate     = isOvernight ? (get('bm-end-date') || null) : null;
      }

      // Time validation
      if (payload.timeStart && payload.timeEnd && payload.timeEnd <= payload.timeStart) {
        window.showToast?.('종료 시간은 시작 시간보다 이후여야 합니다.', 'error');
        applyBtn.disabled = false; applyBtn.textContent = '적용하기';
        return;
      }

      // Schedule collision check when time or location fields are changed
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
        // _computeSeqUpdates reads allLectures (pre-commit), so it can't see the new groupId yet.
        // Compute sequence numbers inline from the current selection.
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

      // Per-lecture fee from feeTotal (bm-cb-fee takes priority if also checked)
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

      // Per-lecture paymentDate derived from each lecture's own date and the chosen settlementCycle
      if (checked('bm-cb-settlementCycle')) {
        const cycle = get('bm-settlementCycle');
        if (cycle) {
          for (const id of selectedIds) {
            const lec = allLectures.find(l => l.id === id);
            if (!lec?.date) continue;
            const paymentDate = calcPaymentDate(lec.date, cycle, lec.endDate || lec.date);
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

function _closeBatchModal() {
  const bd = document.getElementById('bm-backdrop');
  if (!bd) return;
  bd.classList.remove('open');
  setTimeout(() => bd.remove(), 200);
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
_injectBatchStyles();
_injectBatchBar();

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
