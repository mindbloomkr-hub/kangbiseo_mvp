// js/pages/lectures.js — 강의 관리 (Firebase 연동, ES Module)

import { subscribeLectures, authGuard, db } from '../api.js';
import { writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { TODAY, STATUS_META, escapeHtml, formatDateKo, classifyStatus } from '../utils.js';
import { initLectureModal, openModal } from '../components/lectureModal.js';

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
        return d !== 0 ? d : (a.timeStart ?? '').localeCompare(b.timeStart ?? '');
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
    merged.set(id, { ...(merged.get(id) ?? {}), ...upd });
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
        <p class="bm-hint">입력하지 않은 항목은 기존 값을 유지합니다.</p>
        <div class="bm-field"><label class="bm-label" for="bm-client">고객사</label><input class="bm-input" type="text" id="bm-client" placeholder="고객사명" /></div>
        <div class="bm-field"><label class="bm-label" for="bm-place">강의장 주소</label><input class="bm-input" type="text" id="bm-place" placeholder="장소 또는 주소 입력" /></div>
        <div class="bm-field"><label class="bm-label" for="bm-fee">강사료 (만원)</label><input class="bm-input" type="number" id="bm-fee" placeholder="숫자만 입력" /></div>
        <div class="bm-field">
          <label class="bm-label" for="bm-progress">진행 상태</label>
          <select class="bm-select" id="bm-progress">
            <option value="">변경 안 함</option>
            <option value="discussing">💬 논의 중</option>
            <option value="scheduled">📅 강의 예정</option>
            <option value="done">✅ 진행 완료</option>
            <option value="onhold">⏸ 보류 중</option>
            <option value="cancelled">❌ 취소/드롭</option>
            <option value="needs_review">🔍 확인 필요</option>
          </select>
        </div>
        <div class="bm-field">
          <label class="bm-label" for="bm-paid">입금 상태</label>
          <select class="bm-select" id="bm-paid">
            <option value="">변경 안 함</option>
            <option value="true">✅ 입금 완료</option>
            <option value="false">❌ 미입금</option>
          </select>
        </div>
        <div class="bm-field"><label class="bm-label" for="bm-mgr-name">담당자명</label><input class="bm-input" type="text" id="bm-mgr-name" placeholder="담당자 이름" /></div>
        <div class="bm-field"><label class="bm-label" for="bm-mgr-phone">담당자 연락처</label><input class="bm-input" type="tel" id="bm-mgr-phone" placeholder="010-0000-0000" /></div>
        <div class="bm-field"><label class="bm-label" for="bm-mgr-email">담당자 이메일</label><input class="bm-input" type="email" id="bm-mgr-email" placeholder="example@email.com" /></div>
        ${hasGroup ? `
        <hr class="bm-divider" />
        <div class="bm-seq-row">
          <div>
            <span class="bm-seq-label">🔢 회차 자동 설정</span>
            <span class="bm-seq-sub">같은 그룹의 모든 강의를 날짜·시간순으로 자동 정렬합니다.</span>
          </div>
          <input type="checkbox" id="bm-seq-cb" style="width:18px;height:18px;cursor:pointer;accent-color:#2563eb;flex-shrink:0" />
        </div>` : ''}
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

  document.getElementById('bm-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('bm-apply');
    applyBtn.disabled = true; applyBtn.textContent = '적용 중...';
    try {
      const payload = {};
      const client   = document.getElementById('bm-client')?.value.trim();
      const place    = document.getElementById('bm-place')?.value.trim();
      const fee      = document.getElementById('bm-fee')?.value.trim();
      const progress = document.getElementById('bm-progress')?.value;
      const paid     = document.getElementById('bm-paid')?.value;
      const mgrName  = document.getElementById('bm-mgr-name')?.value.trim();
      const mgrPhone = document.getElementById('bm-mgr-phone')?.value.trim();
      const mgrEmail = document.getElementById('bm-mgr-email')?.value.trim();
      const doSeq    = document.getElementById('bm-seq-cb')?.checked ?? false;

      if (client)   payload.client         = client;
      if (place)    payload.place          = place;
      if (fee)      payload.fee            = Number(fee);
      if (progress) payload.progressStatus = progress;
      if (paid)     payload.isPaid         = paid === 'true';
      if (mgrName)  payload.managerName    = mgrName;
      if (mgrPhone) payload.managerPhone   = mgrPhone;
      if (mgrEmail) payload.managerEmail   = mgrEmail;

      const seqUpdates = doSeq ? _computeSeqUpdates() : {};
      if (Object.keys(payload).length === 0 && Object.keys(seqUpdates).length === 0) {
        window.showToast?.('변경할 내용이 없습니다.', 'warn');
        applyBtn.disabled = false; applyBtn.textContent = '적용하기';
        return;
      }

      await _executeBatch(payload, seqUpdates);
      window.showToast?.(`${selectedIds.size}건이 수정되었습니다.`, 'success');
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
authGuard(user => {
  currentUser = user;
  initLectureModal(() => ({ allLectures, currentUser }));
  initLectures(user.uid);
}, {
  withModal: true,
  cleanupFn: () => unsubLectures?.(),
});
