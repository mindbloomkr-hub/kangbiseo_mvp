// js/pages/todolist.js — 할 일 관리 컨트롤 타워
import { subscribeLectures, authGuard } from '../api.js';
import { subscribeTodos, addTodo, clearDoneTodos, postponeAllTodayTodos } from '../services/todoService.js';
import { renderTodoList, bindTodoEvents } from '../components/todoComponent.js';
import { getTodayString, escapeHtml, positionPanel } from '../utils.js';
import { initLectureModal, openModal, getTopicTags } from '../components/lectureModal.js';

/* ════════════════════════════════════════
   전역 상태
════════════════════════════════════════ */
let allTodos    = [];
let allLectures = [];
let currentUser = null;
let _unsub      = null;
let _unsubLec   = null;

const _filters = {
  search:   '',
  dateFrom: '',
  dateTo:   '',
  doneFrom: '',
  doneTo:   '',
  status:   'all',   // 'all' | 'active' | 'done'
  tagId:    null,    // null = 전체, number = 특정 태그
};

// Converts a Firestore Timestamp (or Date) to YYYY-MM-DD string
function _fmtDate(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  } catch { return null; }
}

/* ════════════════════════════════════════
   1. 통계 계산 및 렌더링
════════════════════════════════════════ */
function _computeStats() {
  const total  = allTodos.length;
  const done   = allTodos.filter(t => t.isDone).length;
  const active = total - done;
  const rate   = total === 0 ? 0 : Math.round((done / total) * 100);

  const topPostponed = [...allTodos]
    .filter(t => (t.postponeCount != null ? t.postponeCount : 0) > 0)
    .sort((a, b) => (b.postponeCount != null ? b.postponeCount : 0) - (a.postponeCount != null ? a.postponeCount : 0))
    .slice(0, 3);

  return { total, done, active, rate, topPostponed };
}

function renderStats() {
  const bar = document.getElementById('tl-stat-bar');
  if (!bar) return;
  const s = _computeStats();

  const topHtml = s.topPostponed.length > 0
    ? s.topPostponed.map(t => `
        <div class="tl-postponed-item">
          <span class="tl-postponed-badge">×${t.postponeCount}</span>
          <span class="tl-postponed-text">${escapeHtml(t.text)}</span>
        </div>`).join('')
    : '<p class="tl-empty-hint">미룬 항목이 없어요 👍</p>';

  const rateColor = s.rate >= 80 ? 'stat-icon--green' : s.rate >= 40 ? 'stat-icon--yellow' : 'stat-icon--red';

  bar.innerHTML = `
    <div class="tl-stat-card">
      <div class="stat-icon stat-icon--blue">📋</div>
      <div class="stat-body">
        <div class="stat-value">${s.total}건</div>
        <div class="stat-label">전체 할 일</div>
        <div class="stat-delta" style="color:var(--color-text-muted)">${s.active}건 미완료</div>
      </div>
    </div>
    <div class="tl-stat-card">
      <div class="stat-icon ${rateColor}">✅</div>
      <div class="stat-body">
        <div class="stat-value">${s.rate}%</div>
        <div class="stat-label">완료율</div>
        <div class="stat-delta" style="color:var(--color-text-muted)">${s.done}건 완료</div>
      </div>
    </div>
    <div class="tl-stat-card tl-stat-card--wide">
      <div class="stat-icon stat-icon--yellow">⏭</div>
      <div class="stat-body tl-postponed-body">
        <div class="stat-label" style="margin-bottom:6px;font-weight:700;">최다 미룸 TOP 3</div>
        <div class="tl-postponed-list">${topHtml}</div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   2. 다중 조건 필터링
════════════════════════════════════════ */
function _applyFilters(todos) {
  return todos.filter(t => {
    if (_filters.search && !t.text.toLowerCase().includes(_filters.search.toLowerCase()))
      return false;
    if (_filters.dateFrom && t.deadline && t.deadline < _filters.dateFrom)
      return false;
    if (_filters.dateTo && t.deadline && t.deadline > _filters.dateTo)
      return false;
    if (_filters.doneFrom || _filters.doneTo) {
      if (!t.isDone) return false;
      const doneStr = _fmtDate(t.completedAt);
      if (!doneStr) return false;
      if (_filters.doneFrom && doneStr < _filters.doneFrom) return false;
      if (_filters.doneTo   && doneStr > _filters.doneTo)   return false;
    }
    if (_filters.status === 'active' && t.isDone)  return false;
    if (_filters.status === 'done'   && !t.isDone) return false;
    if (_filters.tagId !== null) {
      const lec = t.lectureId
        ? allLectures.find(l => l.id === t.lectureId)
        : t.groupId
          ? allLectures.find(l => l.groupId === t.groupId)
          : null;
      const effectiveTagId = (lec != null && lec.topicTagId != null ? lec.topicTagId : null);
      if (_filters.tagId === '__general__') {
        if (effectiveTagId !== null) return false;
      } else {
        if (effectiveTagId !== _filters.tagId) return false;
      }
    }
    return true;
  });
}

function renderFilteredList() {
  const listEl  = document.getElementById('tl-todo-list');
  const countEl = document.getElementById('tl-result-count');

  const filtered = _applyFilters(allTodos);
  renderTodoList(listEl, filtered, allLectures, getTopicTags());

  if (countEl) {
    const done = filtered.filter(t => t.isDone).length;
    countEl.textContent = `${filtered.length}건 표시 중 · 완료 ${done}건`;
  }
}

/* ════════════════════════════════════════
   3. 카테고리 피커
════════════════════════════════════════ */
function _updateCategoryFilter() {
  const listEl   = document.getElementById('tl-cat-option-list');
  const swatchEl = document.getElementById('tl-cat-swatch');
  const labelEl  = document.getElementById('tl-cat-label');
  if (!listEl) return;

  const selectedTagId = _filters.tagId;
  const allTags       = getTopicTags();
  const tagLookup     = new Map(allTags.map(t => [t.id, t]));

  // Walk all todos → linked lecture → topicTagId to build used-tags map
  const usedMap    = new Map(); // tagId → { id, name, color }
  let   hasGeneral = false;

  allTodos.forEach(t => {
    const lec = t.lectureId
      ? allLectures.find(l => l.id === t.lectureId)
      : t.groupId
        ? allLectures.find(l => l.groupId === t.groupId)
        : null;
    const tid = (lec != null && lec.topicTagId != null ? lec.topicTagId : null);
    if (tid !== null) {
      if (!usedMap.has(tid)) {
        const tag = tagLookup.get(tid);
        usedMap.set(tid, tag
          ? { id: tid, name: tag.name, color: tag.color ?? '#9ca3af' }
          : { id: tid, name: `태그 ${tid}`, color: '#9ca3af' }
        );
      }
    } else {
      hasGeneral = true;
    }
  });

  // Update trigger swatch + label to reflect current selection
  const isGeneral = selectedTagId === '__general__';
  const selTag    = (!isGeneral && selectedTagId != null)
    ? (usedMap.get(selectedTagId) ?? tagLookup.get(selectedTagId) ?? null)
    : null;

  if (swatchEl) {
    if (isGeneral) {
      swatchEl.style.background = '#9ca3af';
      swatchEl.style.display    = 'inline-block';
    } else {
      swatchEl.style.background = selTag?.color ?? 'transparent';
      swatchEl.style.display    = selTag ? 'inline-block' : 'none';
    }
  }
  if (labelEl) labelEl.textContent = isGeneral ? '일반' : (selTag ? selTag.name : '전체 카테고리');

  const noneHtml = `
    <div class="lm-tag-option lm-tag-option-none${selectedTagId == null ? ' selected' : ''}"
         data-cat-id="" role="option" aria-selected="${selectedTagId == null}">
      <span class="lm-tag-option-dot"></span><span>전체 카테고리</span>
    </div>`;

  const generalHtml = hasGeneral ? `
    <div class="lm-tag-option${isGeneral ? ' selected' : ''}"
         data-cat-id="__general__" role="option" aria-selected="${isGeneral}">
      <span class="lm-tag-option-dot" style="background:#9ca3af;border-color:#9ca3af"></span>
      <span>일반</span>
    </div>` : '';

  const tagsHtml = [...usedMap.values()].map(t => `
    <div class="lm-tag-option${t.id === selectedTagId ? ' selected' : ''}"
         data-cat-id="${t.id}" role="option" aria-selected="${t.id === selectedTagId}">
      <span class="lm-tag-option-dot" style="background:${escapeHtml(t.color)}"></span>
      <span>${escapeHtml(t.name)}</span>
    </div>`).join('');

  listEl.innerHTML = noneHtml + generalHtml + tagsHtml;
}

let _catPanelAbortCtrl = null;

function _openCatPanel() {
  const trigger = document.getElementById('tl-cat-trigger');
  const panel   = document.getElementById('tl-cat-panel');
  if (!trigger || !panel) return;

  _catPanelAbortCtrl?.abort();
  _catPanelAbortCtrl = new AbortController();
  const { signal } = _catPanelAbortCtrl;

  // Escape parent overflow/clip by living at the top of the DOM
  if (panel.parentNode !== document.body) document.body.appendChild(panel);
  positionPanel(trigger, panel);
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');

  window.addEventListener('resize', () => _closeCatPanel(), { signal });
  document.addEventListener('scroll', e => {
    if (panel.contains(e.target)) return;
    _closeCatPanel();
  }, { capture: true, signal });
}

function _closeCatPanel() {
  const trigger = document.getElementById('tl-cat-trigger');
  const panel   = document.getElementById('tl-cat-panel');
  if (!panel) return;
  panel.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  _catPanelAbortCtrl?.abort();
  _catPanelAbortCtrl = null;
}

function _initCatPicker() {
  const trigger = document.getElementById('tl-cat-trigger');
  const panel   = document.getElementById('tl-cat-panel');
  const listEl  = document.getElementById('tl-cat-option-list');
  if (!trigger || !panel || !listEl) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden ? _openCatPanel() : _closeCatPanel();
  });

  listEl.addEventListener('click', e => {
    const opt = e.target.closest('[data-cat-id]');
    if (!opt) return;
    const raw = opt.dataset.catId;
    _filters.tagId = raw === '' ? null : raw === '__general__' ? '__general__' : Number(raw);
    _updateCategoryFilter();
    _closeCatPanel();
    renderFilteredList();
  });

  document.addEventListener('click', e => {
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    _closeCatPanel();
  });
}

/* ════════════════════════════════════════
   4. 필터 이벤트 바인딩
════════════════════════════════════════ */
function _bindFilterEvents() {
  document.getElementById('tl-search')?.addEventListener('input', e => {
    _filters.search = e.target.value.trim();
    renderFilteredList();
  });

  document.getElementById('tl-date-from')?.addEventListener('change', e => {
    _filters.dateFrom = e.target.value;
    renderFilteredList();
  });

  document.getElementById('tl-date-to')?.addEventListener('change', e => {
    _filters.dateTo = e.target.value;
    renderFilteredList();
  });

  document.getElementById('tl-done-from')?.addEventListener('change', e => {
    _filters.doneFrom = e.target.value;
    renderFilteredList();
  });

  document.getElementById('tl-done-to')?.addEventListener('change', e => {
    _filters.doneTo = e.target.value;
    renderFilteredList();
  });

  document.getElementById('tl-status-group')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    _filters.status = btn.dataset.status;
    document.querySelectorAll('.tl-status-btn').forEach(b =>
      b.classList.toggle('active', b === btn));
    renderFilteredList();
  });

  document.getElementById('tl-filter-reset')?.addEventListener('click', () => {
    _filters.search   = '';
    _filters.dateFrom = '';
    _filters.dateTo   = '';
    _filters.doneFrom = '';
    _filters.doneTo   = '';
    _filters.status   = 'all';
    _filters.tagId    = null;

    const el = id => document.getElementById(id);
    const clear = id => { const e = el(id); if (e) e.value = ''; };
    clear('tl-search');
    clear('tl-date-from');
    clear('tl-date-to');
    clear('tl-done-from');
    clear('tl-done-to');

    document.querySelectorAll('.tl-status-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.status === 'all'));

    _updateCategoryFilter();
    renderFilteredList();
  });
}

/* ════════════════════════════════════════
   5. 일괄 작업
════════════════════════════════════════ */
async function _clearDone() {
  try {
    await clearDoneTodos(allTodos);
    window.showToast?.('완료된 항목을 삭제했어요.', 'success');
  } catch (err) { console.error('[강비서] 완료 삭제 오류:', err); }
}

async function _postponeAll() {
  try {
    const count = await postponeAllTodayTodos(allTodos);
    if (count > 0) window.showToast?.(`${count}개를 내일로 미뤘어요.`, 'success');
    else            window.showToast?.('오늘 마감 미완료 항목이 없어요.', 'info');
  } catch (err) { console.error('[강비서] 일괄 미루기 오류:', err); }
}

async function _addTodo() {
  const input   = document.getElementById('tl-todo-input');
  const dateEl  = document.getElementById('tl-todo-due-date');
  const text    = input?.value.trim();
  const dueDate = dateEl?.value || null;
  if (!text || !currentUser) return;
  try {
    await addTodo(currentUser.uid, text, null, null, dueDate);
    input.value = '';
    if (dateEl) dateEl.value = '';
  } catch (err) { console.error('[강비서] Todo 추가 오류:', err); }
}

/* ════════════════════════════════════════
   6. 초기화
════════════════════════════════════════ */
function _init(user) {
  currentUser = user;

  // 이벤트 위임 (목록 전체) — 배지 클릭 포함, 필터링된 배열을 getter로 전달
  const listEl = document.getElementById('tl-todo-list');
  bindTodoEvents(listEl, () => _applyFilters(allTodos), {
    getAllLectures: () => allLectures,
    openModal,
  });

  // 필터 & 피커
  _bindFilterEvents();
  _initCatPicker();

  // 일괄 작업 버튼
  document.getElementById('tl-clear-done')?.addEventListener('click', _clearDone);
  document.getElementById('tl-postpone-all')?.addEventListener('click', _postponeAll);

  // 할 일 추가
  document.getElementById('tl-todo-add-btn')?.addEventListener('click', _addTodo);
  document.getElementById('tl-todo-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _addTodo();
  });

  // 강의 구독 (배지 표시용)
  _unsubLec = subscribeLectures(user.uid, snap => {
    allLectures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFilteredList();
    _updateCategoryFilter();
  }, err => console.error('[강비서] 강의 구독 오류:', err));

  // 할 일 실시간 구독
  _unsub = subscribeTodos(user.uid, updated => {
    allTodos = updated;
    renderStats();
    renderFilteredList();
    _updateCategoryFilter();
  }, err => console.error('[강비서] Todo 구독 오류:', err));
}

/* ════════════════════════════════════════
   인증 가드
════════════════════════════════════════ */
authGuard(async user => {
  currentUser = user;
  await initLectureModal(() => ({ allLectures, currentUser }));
  _init(user);
}, {
  withModal: true,
  cleanupFn: () => { _unsub?.(); _unsubLec?.(); },
});
