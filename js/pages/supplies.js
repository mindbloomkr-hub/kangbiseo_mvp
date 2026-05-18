// js/pages/supplies.js — 준비물 마스터 관리
import { db, authGuard } from '../api.js';
import {
  doc,
  getDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

const LS_GLOBAL_KEY = 'kangbiseo_global_supplies';  // [{name}]
const LS_TOPIC_KEY  = 'kangbiseo_topic_supplies';   // { [tagId]: [{name}] }

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════
   전역 상태
════════════════════════════════════════ */
let _uid            = null;
let _topicTags      = [];   // [{id, name, color}]
let _topicSupplies  = {};   // { [tagId]: [{id, name, isChecked}] } — Firestore 미러
let _globalSupplies = [];   // [{id, name}] — Firestore 미러 (users/{uid}.globalSupplies)

// ─ 현재 뷰: 'global' | 'topic' | null
let _activeView  = null;
let _activeTagId = null;

// ─ 공통 목록 편집 상태 (global view working copy)
let _editingGlobal = [];    // [{id, name}]

// ─ 주제 설정 상태 (topic view)
let _currentPresets = [];   // [{name, included}]
let _currentChips   = [];   // [{id, name}]

let _isDirty = false;

/* ════════════════════════════════════════
   Firestore 로드
════════════════════════════════════════ */
async function _loadUserData() {
  if (!_uid) return;
  try {
    const snap = await getDoc(doc(db, 'users', _uid));
    if (!snap.exists()) return;
    const data = snap.data();
    _topicTags     = Array.isArray(data.topicTags) ? data.topicTags
                   : (Array.isArray(data.topics)   ? data.topics : []);
    _topicSupplies = (data.topicSupplies != null && typeof data.topicSupplies === 'object')
                   ? data.topicSupplies : {};
    _globalSupplies = Array.isArray(data.globalSupplies) ? data.globalSupplies : [];
  } catch (err) {
    console.error('[강비서] 사용자 데이터 로드 오류:', err);
  }
}

/* ════════════════════════════════════════
   localStorage 동기
════════════════════════════════════════ */
function _syncGlobalStorage() {
  try {
    localStorage.setItem(LS_GLOBAL_KEY, JSON.stringify(
      _globalSupplies.map(g => ({ name: g.name }))
    ));
  } catch {}
}

function _syncTopicStorage(tagId, items) {
  try {
    const raw = localStorage.getItem(LS_TOPIC_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[String(tagId)] = items.map(({ name }) => ({ name }));
    localStorage.setItem(LS_TOPIC_KEY, JSON.stringify(map));
  } catch {}
}

/* ════════════════════════════════════════
   뷰 전환 헬퍼
════════════════════════════════════════ */
function _showView(view) {
  // view: 'empty' | 'global' | 'topic'
  const emptyEl  = document.getElementById('sp-empty-state');
  const globalEl = document.getElementById('sp-global-panel');
  const topicEl  = document.getElementById('sp-panel');
  if (emptyEl)  emptyEl.style.display = view === 'empty'  ? '' : 'none';
  if (globalEl) globalEl.hidden       = view !== 'global';
  if (topicEl)  topicEl.hidden        = view !== 'topic';
}

function _canSwitch() {
  if (!_isDirty) return true;
  return confirm('저장하지 않은 변경사항이 있습니다.\n계속하면 변경사항을 잃게 됩니다. 이동할까요?');
}

/* ════════════════════════════════════════
   공통 준비물 목록 뷰 선택
════════════════════════════════════════ */
function _selectGlobalView() {
  if (_activeView === 'global') return;
  if (!_canSwitch()) return;

  _activeView  = 'global';
  _activeTagId = null;
  _isDirty     = false;

  // 편집용 복사본 초기화
  _editingGlobal = _globalSupplies.map(g => ({ ...g }));

  _showView('global');
  _renderGlobalList();
  _renderTagList();

  if (window.innerWidth <= 768) {
    document.getElementById('sp-global-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ════════════════════════════════════════
   주제 설정 뷰 선택
════════════════════════════════════════ */
function _selectTopicView(tagId) {
  const tag = tagId === 'none'
    ? { id: 'none', name: '일반 강의', color: '#9ca3af' }
    : _topicTags.find(t => t.id === tagId);
  if (!tag) return;
  if (!_canSwitch()) return;

  _activeView  = 'topic';
  _activeTagId = tagId;
  _isDirty     = false;

  _populateFromSaved(String(tagId));

  _showView('topic');
  _renderPanelHeader(tag);
  _renderPresets();
  _renderChips();
  _renderTagList();

  if (window.innerWidth <= 768) {
    document.getElementById('sp-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ════════════════════════════════════════
   저장된 주제 데이터 → 상태 채우기
   - _globalSupplies 기준으로 프리셋/커스텀 칩 분류
   - 글로벌 목록에서 삭제된 항목은 커스텀 칩으로 강등
════════════════════════════════════════ */
function _populateFromSaved(tagIdStr) {
  const saved     = _topicSupplies[tagIdStr];
  const globalSet = new Set(_globalSupplies.map(g => g.name));

  if (!saved || saved.length === 0) {
    // 처음 설정하는 주제: 현재 글로벌 목록 전체를 기본 포함
    _currentPresets = _globalSupplies.map(g => ({ name: g.name, included: true }));
    _currentChips   = [];
    return;
  }

  const savedNames = new Set(saved.map(s => s.name));

  // 현재 글로벌 목록 기준으로 체크 상태 결정
  _currentPresets = _globalSupplies.map(g => ({
    name:     g.name,
    included: savedNames.has(g.name),
  }));

  // 저장된 항목 중 현재 글로벌 목록에 없는 것 → 커스텀 칩
  _currentChips = saved
    .filter(s => !globalSet.has(s.name))
    .map((s, i) => ({ id: i + 1, name: s.name }));
}

/* ════════════════════════════════════════
   공통 목록 저장
════════════════════════════════════════ */
async function _saveGlobal() {
  if (!_uid) return;
  const saveBtn = document.getElementById('sp-global-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중…'; }

  try {
    await updateDoc(doc(db, 'users', _uid), { globalSupplies: _editingGlobal });

    // 메모리 미러 갱신
    _globalSupplies = _editingGlobal.map(g => ({ ...g }));
    _syncGlobalStorage();

    _isDirty = false;
    _renderTagList();
    window.showToast?.('공통 준비물 목록이 저장되었습니다.', 'success');
  } catch (err) {
    console.error('[강비서] 공통 준비물 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 저장하기'; }
  }
}

/* ════════════════════════════════════════
   주제 준비물 저장
════════════════════════════════════════ */
async function _saveTopic() {
  if (_activeTagId == null || !_uid) return;
  const saveBtn = document.getElementById('sp-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중…'; }

  const includedPresets = _currentPresets
    .filter(p => p.included)
    .map((p, i) => ({ id: i + 1, name: p.name, isChecked: false }));

  const customItems = _currentChips.map((c, j) => ({
    id: includedPresets.length + j + 1,
    name: c.name,
    isChecked: false,
  }));

  const merged = [...includedPresets, ...customItems];

  try {
    await updateDoc(
      doc(db, 'users', _uid),
      { [`topicSupplies.${String(_activeTagId)}`]: merged }
    );

    _topicSupplies[String(_activeTagId)] = merged;
    _syncTopicStorage(_activeTagId, merged);

    _isDirty = false;
    _renderTagList();
    window.showToast?.('준비물이 저장되었습니다.', 'success');
  } catch (err) {
    console.error('[강비서] 준비물 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 저장하기'; }
  }
}

/* ════════════════════════════════════════
   공통 목록 항목 추가
════════════════════════════════════════ */
function _addGlobalItem(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (_editingGlobal.some(g => g.name === trimmed)) {
    window.showToast?.('이미 존재하는 항목입니다.', 'warn');
    return;
  }
  const newId = _editingGlobal.length > 0
    ? Math.max(..._editingGlobal.map(g => g.id)) + 1
    : 1;
  _editingGlobal.push({ id: newId, name: trimmed });
  _renderGlobalList();
  _isDirty = true;
}

/* ════════════════════════════════════════
   주제 커스텀 칩 추가
════════════════════════════════════════ */
function _addChip(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const globalNames = new Set(_globalSupplies.map(g => g.name));
  if (globalNames.has(trimmed)) {
    window.showToast?.(`"${trimmed}"은 공통 준비물 목록에 이미 있어요.`, 'warn');
    return;
  }
  if (_currentChips.some(c => c.name === trimmed)) {
    window.showToast?.('이미 추가된 항목입니다.', 'warn');
    return;
  }

  const newId = _currentChips.length > 0
    ? Math.max(..._currentChips.map(c => c.id)) + 1
    : 1;
  _currentChips.push({ id: newId, name: trimmed });
  _renderChips();
  _isDirty = true;
}

/* ════════════════════════════════════════
   렌더 — 사이드바 태그 목록
   구조: [공통 항목] [구분선] [라벨] [주제 태그들]
════════════════════════════════════════ */
function _renderTagList() {
  const listEl  = document.getElementById('sp-tag-list');
  const countEl = document.getElementById('sp-tag-count');
  if (!listEl) return;

  if (countEl) countEl.textContent = `${_topicTags.length}개`;

  const isGlobalActive  = _activeView === 'global';
  const isNoneActive    = _activeView === 'topic' && _activeTagId === 'none';
  const _noneSaved      = _topicSupplies['none'];
  const _noneCount      = _noneSaved ? _noneSaved.length : 0;

  const globalBadge     = _globalSupplies.length > 0
    ? `<span class="sp-tag-item-badge">${_globalSupplies.length}개</span>`
    : '';

  const globalItemHtml = `
    <div class="sp-tag-item sp-global-item${isGlobalActive ? ' is-active' : ''}"
         data-view="global"
         role="listitem"
         tabindex="0"
         aria-selected="${isGlobalActive}">
      <span class="sp-tag-icon">⚙️</span>
      <span class="sp-tag-item-name">공통 준비물 목록</span>
      ${globalBadge}
    </div>`;

  const noneItemHtml = `
    <div class="sp-tag-item${isNoneActive ? ' is-active' : ''}"
         role="listitem"
         data-tag-id="none"
         style="border-left-color:${isNoneActive ? '#9ca3af' : 'transparent'}"
         tabindex="0"
         aria-selected="${isNoneActive}">
      <span class="sp-tag-dot" style="background:#9ca3af;"></span>
      <span class="sp-tag-item-name">일반 강의</span>
      ${_noneCount > 0 ? `<span class="sp-tag-item-badge">${_noneCount}개</span>` : ''}
    </div>`;

  if (_topicTags.length === 0) {
    listEl.innerHTML = globalItemHtml + noneItemHtml + `
      <div class="sp-list-divider"></div>
      <div class="sp-tag-empty">등록된 주제 태그가 없어요.<br />강의 등록 시 주제를 추가해 보세요.</div>`;
    return;
  }

  const topicItemsHtml = `
    <div class="sp-list-divider"></div>
    <div class="sp-list-label">주제 태그</div>` +
    _topicTags.map(tag => {
      const tagIdStr  = String(tag.id);
      const saved     = _topicSupplies[tagIdStr];
      const itemCount = saved ? saved.length : 0;
      const isActive  = _activeView === 'topic' && tag.id === _activeTagId;
      const color     = tag.color || '#9ca3af';

      return `
        <div class="sp-tag-item${isActive ? ' is-active' : ''}"
             role="listitem"
             data-tag-id="${escapeHtml(tagIdStr)}"
             style="border-left-color:${isActive ? escapeHtml(color) : 'transparent'}"
             tabindex="0"
             aria-selected="${isActive}">
          <span class="sp-tag-dot" style="background:${escapeHtml(color)};"></span>
          <span class="sp-tag-item-name">${escapeHtml(tag.name)}</span>
          ${itemCount > 0
            ? `<span class="sp-tag-item-badge">${itemCount}개</span>`
            : ''}
        </div>`;
    }).join('');

  listEl.innerHTML = globalItemHtml + noneItemHtml + topicItemsHtml;
}

/* ════════════════════════════════════════
   렌더 — 공통 준비물 편집 목록
════════════════════════════════════════ */
function _renderGlobalList() {
  const listEl  = document.getElementById('sp-global-list');
  const countEl = document.getElementById('sp-global-count');
  if (!listEl) return;

  if (countEl) countEl.textContent = `${_editingGlobal.length}개`;

  if (_editingGlobal.length === 0) {
    listEl.innerHTML = `<div class="sp-global-empty">아직 등록된 항목이 없어요.<br />아래 입력란에서 공통 준비물을 추가해 보세요.</div>`;
    return;
  }

  listEl.innerHTML = _editingGlobal.map((item, idx) => `
    <div class="sp-global-row" data-id="${item.id}">
      <span class="sp-global-row-idx">${idx + 1}</span>
      <span class="sp-global-row-name">${escapeHtml(item.name)}</span>
      <button type="button" class="sp-global-row-del"
              data-id="${item.id}"
              aria-label="${escapeHtml(item.name)} 삭제">×</button>
    </div>
  `).join('');
}

/* ════════════════════════════════════════
   렌더 — 주제 패널 헤더 칩
════════════════════════════════════════ */
function _renderPanelHeader(tag) {
  const chipEl = document.getElementById('sp-panel-tag-chip');
  if (!chipEl) return;
  const color = tag.color || '#9ca3af';
  const [r, g, b] = [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
  const fg = (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#374151' : '#ffffff';
  chipEl.textContent    = tag.name;
  chipEl.style.background = color;
  chipEl.style.color      = fg;
}

/* ════════════════════════════════════════
   렌더 — 주제 프리셋 체크박스 그리드
   _globalSupplies가 비어있으면 안내 메시지 표시
════════════════════════════════════════ */
function _renderPresets() {
  const grid = document.getElementById('sp-preset-grid');
  if (!grid) return;

  if (_globalSupplies.length === 0) {
    grid.innerHTML = `
      <div class="sp-preset-empty">
        공통 준비물 목록이 비어 있어요.<br />
        먼저 <button type="button" class="sp-link-btn" data-action="goto-global">공통 준비물 목록</button>을 설정해 주세요.
      </div>`;
    return;
  }

  grid.innerHTML = _currentPresets.map((item, idx) => `
    <label class="sp-preset-item${item.included ? ' is-included' : ''}" data-preset-idx="${idx}">
      <input
        type="checkbox"
        class="sp-preset-cb"
        data-preset-idx="${idx}"
        ${item.included ? 'checked' : ''}
        aria-label="${escapeHtml(item.name)}"
      />
      <span class="sp-preset-name">${escapeHtml(item.name)}</span>
    </label>
  `).join('');
}

/* ════════════════════════════════════════
   렌더 — 주제 커스텀 칩
════════════════════════════════════════ */
function _renderChips() {
  const list = document.getElementById('sp-chip-list');
  if (!list) return;

  list.innerHTML = _currentChips.map(chip => `
    <span class="sp-chip" data-chip-id="${chip.id}">
      <span class="sp-chip-name">${escapeHtml(chip.name)}</span>
      <button type="button" class="sp-chip-remove"
              data-chip-id="${chip.id}"
              aria-label="${escapeHtml(chip.name)} 삭제">×</button>
    </span>
  `).join('');
}

/* ════════════════════════════════════════
   이벤트 바인딩 (한 번만 호출)
════════════════════════════════════════ */
function _bindEvents() {
  // ── 사이드바 클릭 / 키보드 (이벤트 위임) ──────────────────────
  const tagListEl = document.getElementById('sp-tag-list');

  function _handleListSelect(e) {
    const globalItem = e.target.closest('.sp-global-item[data-view="global"]');
    if (globalItem) { _selectGlobalView(); return; }

    const tagItem = e.target.closest('.sp-tag-item[data-tag-id]');
    if (tagItem) {
      const raw   = tagItem.dataset.tagId;
      const tagId = isNaN(Number(raw)) ? raw : Number(raw);
      _selectTopicView(tagId);
    }
  }

  tagListEl?.addEventListener('click', _handleListSelect);
  tagListEl?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    _handleListSelect(e);
  });

  // ── 공통 목록 패널 ─────────────────────────────────────────────
  const globalInput = document.getElementById('sp-global-input');

  function _doAddGlobal() {
    _addGlobalItem(globalInput?.value || '');
    if (globalInput) globalInput.value = '';
    globalInput?.focus();
  }

  globalInput?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    _doAddGlobal();
  });

  document.getElementById('sp-global-add-btn')?.addEventListener('click', _doAddGlobal);

  // 공통 목록 행 삭제
  document.getElementById('sp-global-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.sp-global-row-del');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    _editingGlobal = _editingGlobal.filter(g => g.id !== id);
    _renderGlobalList();
    _isDirty = true;
  });

  // 공통 저장 / 초기화
  document.getElementById('sp-global-save-btn')?.addEventListener('click', _saveGlobal);
  document.getElementById('sp-global-reset-btn')?.addEventListener('click', () => {
    if (_isDirty && !confirm('변경사항을 초기화하시겠습니까?')) return;
    _editingGlobal = _globalSupplies.map(g => ({ ...g }));
    _renderGlobalList();
    _isDirty = false;
    window.showToast?.('변경사항이 초기화되었습니다.', 'default');
  });

  // ── 주제 설정 패널 ──────────────────────────────────────────────
  // 프리셋 체크박스 + "공통 목록으로" 링크 버튼
  const presetGrid = document.getElementById('sp-preset-grid');
  presetGrid?.addEventListener('change', e => {
    const cb = e.target.closest('.sp-preset-cb');
    if (!cb) return;
    const idx = Number(cb.dataset.presetIdx);
    if (isNaN(idx) || idx < 0 || idx >= _currentPresets.length) return;
    _currentPresets[idx].included = cb.checked;
    cb.closest('.sp-preset-item')?.classList.toggle('is-included', cb.checked);
    _isDirty = true;
  });
  presetGrid?.addEventListener('click', e => {
    if (e.target.closest('[data-action="goto-global"]')) _selectGlobalView();
  });

  // 커스텀 칩 입력
  const chipInput = document.getElementById('sp-chip-input');
  chipInput?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    chipInput.value.split(',').map(s => s.trim()).filter(Boolean).forEach(name => _addChip(name));
    chipInput.value = '';
  });
  chipInput?.addEventListener('input', e => {
    if (!e.target.value.includes(',')) return;
    const parts    = e.target.value.split(',');
    const trailing = parts.pop();
    const names    = parts.map(s => s.trim()).filter(Boolean);
    if (!names.length) { e.target.value = trailing; return; }
    names.forEach(name => _addChip(name));
    e.target.value = trailing.trimStart();
  });
  document.getElementById('sp-chip-wrap')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) chipInput?.focus();
  });

  // 커스텀 칩 삭제
  document.getElementById('sp-chip-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.sp-chip-remove');
    if (!btn) return;
    const chipId = Number(btn.dataset.chipId);
    _currentChips = _currentChips.filter(c => c.id !== chipId);
    _renderChips();
    _isDirty = true;
  });

  // 주제 저장 / 초기화
  document.getElementById('sp-save-btn')?.addEventListener('click', _saveTopic);
  document.getElementById('sp-reset-btn')?.addEventListener('click', () => {
    if (_isDirty && !confirm('변경사항을 초기화하시겠습니까?')) return;
    _populateFromSaved(String(_activeTagId));
    _renderPresets();
    _renderChips();
    _isDirty = false;
    window.showToast?.('변경사항이 초기화되었습니다.', 'default');
  });

  // 페이지 이탈 경고
  window.addEventListener('beforeunload', e => {
    if (_isDirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ════════════════════════════════════════
   진입점
════════════════════════════════════════ */
authGuard(async user => {
  _uid = user.uid;
  await _loadUserData();

  _renderTagList();
  _bindEvents();

  // 기본으로 공통 준비물 뷰를 열어 둠
  _selectGlobalView();
});
