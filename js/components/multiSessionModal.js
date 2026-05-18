// js/components/multiSessionModal.js — 연속 강의 일괄 등록

import { db } from '../api.js';
import {
  collection, writeBatch, doc, getDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  buildTimeOptions, initAllDateWithDay, checkScheduleConflict,
  formatDateKo, getTodayString, escapeHtml, timeToMin, formatDateString, calcPaymentDate, calcDuration,
  resolveOriginAddr, formatConflictWarning,
} from '../utils.js';
import { PROGRESS_SCHEDULED } from '../constants.js';
import { openKakaoAddress } from '../services/kakaoAddressService.js';
import { getTopicTags, registerMsBulkTagUpdate, refreshMsTagPicker, bindMsTagPickerEvents, getTopicDefaultSupplies } from './lectureModal.js';
import { addTodo } from '../services/todoService.js';
import { renderTodoUI } from './todoComponent.js';

/* ════════════════════════════════════════
   한국 공휴일
════════════════════════════════════════ */
const _SOLAR = new Set([
  '01-01', '03-01', '05-05', '06-06',
  '08-15', '10-03', '10-09', '12-25',
]);

const _LUNAR_RAW = {
  2025: ['2025-01-28','2025-01-29','2025-01-30',
         '2025-05-06',
         '2025-10-05','2025-10-06','2025-10-07','2025-10-08'],
  2026: ['2026-02-16','2026-02-17','2026-02-18',
         '2026-05-25',
         '2026-09-24','2026-09-25','2026-09-26'],
  2027: ['2027-02-05','2027-02-06','2027-02-07',
         '2027-10-14','2027-10-15','2027-10-16'],
};
const _LUNAR = Object.fromEntries(
  Object.entries(_LUNAR_RAW).map(([y, arr]) => [y, new Set(arr)])
);

export function isKRHoliday(date) {
  const d  = date instanceof Date ? date : new Date(date + 'T00:00:00');
  const y  = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return _SOLAR.has(`${mm}-${dd}`) || (_LUNAR[y] != null ? _LUNAR[y].has(`${y}-${mm}-${dd}`) : false);
}

/* ════════════════════════════════════════
   날짜 유틸
════════════════════════════════════════ */
function _skipHoliday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  while (isKRHoliday(d)) d.setDate(d.getDate() + 1);
  return formatDateString(d);
}

function _offsetDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatDateString(d);
}

function _applyDowFromDate(dateStr) {
  if (!dateStr) return;
  const dow = (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7;
  _selDow = new Set([dow]);
  document.querySelectorAll('.ms-dow-pill').forEach(p =>
    p.classList.toggle('active', parseInt(p.dataset.dow) === dow)
  );
}



/* ════════════════════════════════════════
   다회차 강의 총 강의 시간 자동 계산
════════════════════════════════════════ */
function _syncMsDuration() {
  const start = document.getElementById('ms-ts')?.value;
  const end   = document.getElementById('ms-te')?.value;
  const el    = document.getElementById('ms-duration-computed');
  if (el) el.value = (start && end) ? (calcDuration(start, end) || '—') : '';
}


function _renderMsChips() {
  const list = document.getElementById('ms-supplies-chip-list');
  if (!list) return;
  list.innerHTML = _msSupplies.map(item =>
    `<span class="supplies-chip" data-id="${item.id}">` +
    `${escapeHtml(item.name)}` +
    `<button type="button" class="supplies-chip-remove" data-id="${item.id}" aria-label="삭제">×</button>` +
    `</span>`
  ).join('');
}

function _renderMsPresets() {
  const wrap = document.getElementById('ms-supplies-presets-wrap');
  const list = document.getElementById('ms-supplies-presets-list');
  if (!wrap || !list) return;
  if (_msPresets.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  list.innerHTML = _msPresets.map(item =>
    `<label class="supplies-preset-item${item.included ? ' is-checked' : ''}" data-preset-id="${item.id}">` +
    `<input type="checkbox" class="supplies-preset-cb" data-preset-id="${item.id}" ${item.included ? 'checked' : ''} />` +
    `<span>${escapeHtml(item.name)}</span></label>`
  ).join('');
}

/* ════════════════════════════════════════
   일정 생성 엔진
════════════════════════════════════════ */
export function generateSessions(params) {
  const {
    startDate, total, recurrence,
    dayInterval   = 1,
    weekInterval  = 1, weekDays = [0],
    monthInterval = 1, monthMode = 'same', specificDays = [],
    skipHolidays  = false,
  } = params;

  const sessions = [];
  const push = (raw) => {
    const date = skipHolidays ? _skipHoliday(raw) : raw;
    sessions.push({ date, wasShifted: date !== raw, originalDate: raw });
  };

  if (recurrence === 'daily') {
    const cur = new Date(startDate + 'T00:00:00');
    while (sessions.length < total) {
      push(formatDateString(cur));
      cur.setDate(cur.getDate() + dayInterval);
    }

  } else if (recurrence === 'weekly') {
    if (!weekDays.length) return [];
    const sorted = [...weekDays].sort((a, b) => a - b);
    const start  = new Date(startDate + 'T00:00:00');
    const dow0   = (start.getDay() + 6) % 7;
    const monday = new Date(start);
    monday.setDate(start.getDate() - dow0);

    let cycle = 0;
    outer: while (true) {
      for (const dow of sorted) {
        if (sessions.length >= total) break outer;
        const c = new Date(monday);
        c.setDate(monday.getDate() + cycle * weekInterval * 7 + dow);
        if (c >= start) push(formatDateString(c));
      }
      cycle++;
      if (cycle > 2000) break;
    }

  } else if (recurrence === 'monthly') {
    const start    = new Date(startDate + 'T00:00:00');
    const startDay = start.getDate();
    const startDow = start.getDay();

    let nthOccurrence = 0;
    for (let d = 1; d <= startDay; d++) {
      if (new Date(start.getFullYear(), start.getMonth(), d).getDay() === startDow)
        nthOccurrence++;
    }

    let cycle = 0;
    while (sessions.length < total) {
      const totalM     = start.getMonth() + cycle * monthInterval;
      const yr         = start.getFullYear() + Math.floor(totalM / 12);
      const mo         = ((totalM % 12) + 12) % 12;
      const daysInMonth = new Date(yr, mo + 1, 0).getDate();

      if (monthMode === 'same') {
        const day = Math.min(startDay, daysInMonth);
        const raw = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        if (raw >= startDate) push(raw);

      } else if (monthMode === 'nth') {
        let count = 0, found = null;
        for (let d = 1; d <= daysInMonth; d++) {
          if (new Date(yr, mo, d).getDay() === startDow) {
            count++;
            if (count === nthOccurrence) { found = d; break; }
          }
        }
        if (!found) {
          for (let d = daysInMonth; d >= 1; d--) {
            if (new Date(yr, mo, d).getDay() === startDow) { found = d; break; }
          }
        }
        if (found) {
          const raw = `${yr}-${String(mo+1).padStart(2,'0')}-${String(found).padStart(2,'0')}`;
          if (raw >= startDate) push(raw);
        }

      } else if (monthMode === 'specific') {
        const sorted = [...specificDays].sort((a, b) => a - b);
        for (const day of sorted) {
          if (sessions.length >= total) break;
          if (day > daysInMonth) continue;
          const raw = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          if (raw >= startDate) push(raw);
        }
      }

      cycle++;
      if (cycle > 5000) break;
    }
  }

  return sessions.slice(0, total).map((s, i) => ({ ...s, sessionCurrent: i + 1 }));
}


/* ════════════════════════════════════════
   HTML — components/multiSessionModal.html에서 지연 로드
   import.meta.url 기준으로 경로를 해석하므로 페이지 URL에 독립적.
════════════════════════════════════════ */
const _HTML_URL = new URL('../../components/multiSessionModal.html', import.meta.url).href;
let _htmlReady   = null; // Promise | null — resolved when HTML is in DOM
let _eventsBound = false;

function _ensureHTML() {
  if (_htmlReady) return _htmlReady;
  _htmlReady = fetch(_HTML_URL)
    .then(r => {
      if (!r.ok) throw new Error(`multiSessionModal.html 로드 실패 (${r.status})`);
      return r.text();
    })
    .then(html => {
      if (!document.getElementById('ms-bd')) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        while (tmp.firstElementChild) document.body.appendChild(tmp.firstElementChild);
      }
      if (!_eventsBound) { _bindEvents(); _eventsBound = true; }
    })
    .catch(err => {
      console.error('[강비서]', err);
      _htmlReady = null; // allow retry on next open
      throw err;
    });
  return _htmlReady;
}

/* ════════════════════════════════════════
   모듈 상태
════════════════════════════════════════ */
let _sessions           = [];
let _skipHol            = false;
let _isOnline           = false;
let _selDow             = new Set([0]);
let _selDays            = new Set();
let _getCtx             = null;
let _msTagId            = null;
let _schedulerDefaults  = { setupTime: 0, wrapupTime: 0, bufferTime: 30, addresses: { home: '', office: '', other: '' } };
let _msPendingTodos     = [];
let _msRefreshPendingUI = null;
let _feeLastEdited      = 'fee'; // 'fee' | 'fee-total'
let _msSupplies         = []; // [{id, name, isChecked}]
let _msPresets          = []; // [{id, name, included}]

/* ════════════════════════════════════════
   공개 API
════════════════════════════════════════ */

/**
 * initMultiSessionModal(getCtx)
 * 페이지 초기화 시 한 번만 호출 — CSS를 미리 주입하고 컨텍스트를 저장한다.
 * HTML은 openAddModal() 첫 호출 시 지연 로드된다.
 */
export function initMultiSessionModal(getCtx) {
  _getCtx = getCtx;
}

/**
 * openAddModal(startDate?)
 * lectureModal의 openAddModal()과 동일한 네이밍 패턴.
 * 최초 호출 시 HTML을 fetch하여 DOM에 삽입하고 이벤트를 바인딩한다.
 */
export async function openAddModal(startDate) {
  try {
    await _ensureHTML();
  } catch {
    window.showToast?.('모달을 불러올 수 없습니다.', 'error');
    return;
  }

  _reset();

  const bd = document.getElementById('ms-bd');
  requestAnimationFrame(() => bd?.classList.add('open'));
  document.body.style.overflow = 'hidden';

  if (startDate) {
    const startEl = document.getElementById('ms-start');
    if (startEl) { startEl.value = startDate; _applyDowFromDate(startDate); }
  }

  const uid = _getCtx?.()?.currentUser?.uid;
  if (uid) _loadSchedulerSettings(uid);

  document.getElementById('ms-title')?.focus();
}

// 하위 호환 alias — 기존 import를 모두 교체할 필요 없이 동작한다.
export { openAddModal as openMultiSessionModal };

/* ════════════════════════════════════════
   스케줄러 기본값 로드
════════════════════════════════════════ */
async function _loadSchedulerSettings(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      if (d.setupTime     != null) _schedulerDefaults.setupTime     = Number(d.setupTime);
      if (d.wrapupTime    != null) _schedulerDefaults.wrapupTime    = Number(d.wrapupTime);
      if (d.bufferTime    != null) _schedulerDefaults.bufferTime    = Number(d.bufferTime);
      if (d.addresses != null) {
        _schedulerDefaults.addresses = { home: '', office: '', other: '', ...d.addresses };
      } else if (d.originAddress != null) {
        _schedulerDefaults.addresses = { home: d.originAddress, office: '', other: '' };
      }
    }
    const setupEl  = document.getElementById('ms-setup-time');
    const wrapupEl = document.getElementById('ms-wrapup-time');
    const bufferEl = document.getElementById('ms-buffer-time');
    if (setupEl  && !setupEl.value)  setupEl.value  = _schedulerDefaults.setupTime  || '';
    if (wrapupEl && !wrapupEl.value) wrapupEl.value = _schedulerDefaults.wrapupTime || '';
    if (bufferEl && !bufferEl.value) bufferEl.value = _schedulerDefaults.bufferTime || '';
  } catch (err) {
    console.error('[강비서] 스케줄러 설정 로드 오류:', err);
  }
}

function _flashHighlight(el) {
  if (!el) return;
  if (!document.getElementById('date-sync-flash-style')) {
    const s = document.createElement('style');
    s.id = 'date-sync-flash-style';
    s.textContent = '@keyframes _dsFlash{0%{background-color:#fef08a}to{background-color:transparent}}.date-sync-flash{animation:_dsFlash .8s ease-out}';
    document.head.appendChild(s);
  }
  el.classList.remove('date-sync-flash');
  void el.offsetWidth;
  el.classList.add('date-sync-flash');
}

/* ════════════════════════════════════════
   지급일 자동 계산
════════════════════════════════════════ */
function _syncPaymentDate() {
  const cycle = document.getElementById('ms-settlement-cycle')?.value;
  const payEl = document.getElementById('ms-payment-date');
  if (!payEl) return;

  if (!cycle || cycle === 'other') {
    payEl.value = '';
    return;
  }

  const startEl = document.getElementById('ms-start');
  if (!startEl?.value) return;

  const lastDate = (cycle === 'after-completion' && _sessions.length > 0)
    ? _sessions[_sessions.length - 1].date
    : startEl.value;

  const computed = calcPaymentDate(startEl.value, cycle, lastDate);
  payEl.value = computed || '';
}

/* ════════════════════════════════════════
   강사료 양방향 계산
   source: 'fee' | 'fee-total' | 'total'
════════════════════════════════════════ */
function _syncFee(source) {
  const feeTypeEl  = document.getElementById('ms-fee-type');
  const feeType    = feeTypeEl?.value || 'unit';
  const feeEl      = document.getElementById('ms-fee');
  const feeTotalEl = document.getElementById('ms-fee-total');
  const total      = parseInt(document.getElementById('ms-total')?.value);
  if (!feeEl || !feeTotalEl) return;

  // Enforce readonly states based on feeType
  if (feeType === 'fixed') {
    feeEl.readOnly = true;       feeEl.style.background       = '#f3f4f6';
    feeTotalEl.readOnly = false; feeTotalEl.style.background  = '';
  } else {
    feeEl.readOnly = false;      feeEl.style.background       = '';
    feeTotalEl.readOnly = true;  feeTotalEl.style.background  = '#f3f4f6';
  }

  if (source === 'fee' || source === 'fee-total') _feeLastEdited = source;

  if (!total || total <= 0) return;

  // feeType overrides _feeLastEdited for the active direction
  const active = feeType === 'fixed' ? 'fee-total'
               : feeType === 'unit'  ? 'fee'
               : (source === 'total' ? _feeLastEdited : source);

  if (active === 'fee') {
    const fee = parseFloat(feeEl.value);
    feeTotalEl.value = (fee >= 0 && !isNaN(fee)) ? +(fee * total).toFixed(2) : '';
  } else {
    const feeTotal = parseFloat(feeTotalEl.value);
    feeEl.value = (feeTotal >= 0 && !isNaN(feeTotal)) ? +(feeTotal / total).toFixed(2) : '';
  }
}

/* ════════════════════════════════════════
   닫기
════════════════════════════════════════ */
function _close() {
  document.getElementById('ms-bd')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ════════════════════════════════════════
   초기화 (열 때마다)
════════════════════════════════════════ */
function _reset() {
  _sessions = [];
  _skipHol  = false;
  _isOnline = false;
  _selDow   = new Set([0]);
  _selDays  = new Set();

  const $ = id => document.getElementById(id);

  $('ms-title').value            = '';
  $('ms-client').value           = '';
  $('ms-fee').value              = '';
  $('ms-fee-total').value        = '';
  $('ms-settlement-cycle').value = '';
  const _msFeeTypeEl = $('ms-fee-type');
  if (_msFeeTypeEl) _msFeeTypeEl.value = 'unit';
  _feeLastEdited = 'fee';
  // Reset fee readonly states to unit mode (fee editable, fee-total readonly)
  const _msFeeEl = $('ms-fee');
  const _msFeeTotalEl = $('ms-fee-total');
  if (_msFeeEl)      { _msFeeEl.readOnly = false;      _msFeeEl.style.background      = ''; }
  if (_msFeeTotalEl) { _msFeeTotalEl.readOnly = true;  _msFeeTotalEl.style.background = '#f3f4f6'; }

  const onlineCb = $('ms-online');
  if (onlineCb) onlineCb.checked = false;

  const placeEl = $('ms-place');
  if (placeEl) { placeEl.disabled = false; placeEl.value = ''; placeEl.placeholder = '강의장 주소'; }

  const paidSel = $('ms-paid-status');
  if (paidSel) paidSel.value = 'false';
  const taxSel = $('ms-tax');
  if (taxSel) { taxSel.value = 'income3_3'; taxSel.disabled = false; }
  $('ms-payment-date') && ($('ms-payment-date').value = '');

  $('ms-classroom').value     = '';
  $('ms-parking').value       = '';
  $('ms-setup-time').value    = '';
  $('ms-wrapup-time').value   = '';
  const _msFullDayCb = $('ms-full-day'); if (_msFullDayCb) _msFullDayCb.checked = false;
  $('ms-buffer-time').value   = '';
  $('ms-participants').value  = '';
  $('ms-group-info').value    = '';
  _msSupplies = [];
  _renderMsChips();
  _msPresets = getTopicDefaultSupplies(null).map((d, i) => ({ id: i + 1, name: d.name, included: true }));
  _renderMsPresets();
  $('ms-manager-name').value  = '';
  $('ms-manager-phone').value = '';
  $('ms-manager-email').value = '';
  $('ms-total').value         = '';
  $('ms-rec').value           = 'weekly';
  $('ms-week-n').value        = '1';
  $('ms-day-n').value         = '1';
  $('ms-month-n').value       = '1';
  $('ms-progress').value      = 'scheduled';

  // Start date defaults to today
  $('ms-start').value = formatDateString(new Date());

  // Time selects
  $('ms-ts').innerHTML = buildTimeOptions(); $('ms-ts').value = '09:00';
  $('ms-te').innerHTML = buildTimeOptions('09:00'); $('ms-te').value = '10:00';
  _syncMsDuration();

  // Holiday toggle
  const tog = $('ms-hol-toggle');
  tog.classList.remove('on');
  tog.setAttribute('aria-checked', 'false');

  // DOW pills — reset to Monday (dow=0)
  document.querySelectorAll('.ms-dow-pill').forEach(p =>
    p.classList.toggle('active', parseInt(p.dataset.dow) === 0)
  );

  // Day chips
  document.querySelectorAll('.ms-day-chip').forEach(c => c.classList.remove('active'));

  // Month mode
  document.querySelector('input[name="ms-mm"][value="same"]').checked = true;
  $('ms-day-grid').style.display = 'none';

  // Recurrence sub-panels
  _syncRec('weekly');

  // Tag picker reset
  _msTagId = null;
  refreshMsTagPicker(null);

  // Pending todo reset
  _msPendingTodos     = [];
  _msRefreshPendingUI = null;
  const todoListEl    = $('ms-todo-list');
  if (todoListEl) {
    _msRefreshPendingUI = renderTodoUI(todoListEl, null, {
      getPendingTodos: () => _msPendingTodos,
      onPendingChange: updated => { _msPendingTodos = updated; },
    });
  }

  // Hide preview + disable save
  $('ms-preview').style.display = 'none';
  $('ms-save').disabled         = true;
  $('ms-save').textContent      = '저장하기';
}

/* ════════════════════════════════════════
   이벤트 바인딩 — _ensureHTML에서 한 번만 호출
════════════════════════════════════════ */
function _bindEvents() {
  const $ = id => document.getElementById(id);

  // Close
  $('ms-x').addEventListener('click', _close);
  $('ms-cancel').addEventListener('click', _close);
  $('ms-bd').addEventListener('click', e => { if (e.target === $('ms-bd')) _close(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const msPanel = $('ms-tag-panel');
    if (msPanel && !msPanel.hidden) {
      msPanel.hidden = true;
      $('ms-tag-trigger')?.setAttribute('aria-expanded', 'false');
      return;
    }
    if ($('ms-bd')?.classList.contains('open')) _close();
  });

  // Recurrence switch
  $('ms-rec').addEventListener('change', e => _syncRec(e.target.value));

  // Auto-select DOW pill when start date changes; also re-sync payment date
  $('ms-start').addEventListener('change', e => {
    if ($('ms-rec').value === 'weekly') _applyDowFromDate(e.target.value);
    _syncPaymentDate();
  });

  // Settlement cycle → auto-compute payment date
  $('ms-settlement-cycle')?.addEventListener('change', _syncPaymentDate);

  // Time selects → filter end-time options + auto-compute duration
  $('ms-ts')?.addEventListener('change', e => {
    const startVal = e.target.value;
    const teEl     = $('ms-te');
    if (!teEl) return;
    const prevEnd  = teEl.value;
    teEl.innerHTML = buildTimeOptions(startVal);
    teEl.value     = (prevEnd && prevEnd > startVal) ? prevEnd : '';
    _syncMsDuration();
  });
  $('ms-te')?.addEventListener('change', _syncMsDuration);

  // DOW pills
  $('ms-dow-row').addEventListener('click', e => {
    const pill = e.target.closest('.ms-dow-pill');
    if (!pill) return;
    const dow = parseInt(pill.dataset.dow);
    if (_selDow.has(dow)) { if (_selDow.size > 1) _selDow.delete(dow); }
    else _selDow.add(dow);
    document.querySelectorAll('.ms-dow-pill').forEach(p =>
      p.classList.toggle('active', _selDow.has(parseInt(p.dataset.dow)))
    );
  });

  // Month mode radios
  $('ms-month-mode').addEventListener('change', e => {
    if (e.target.name !== 'ms-mm') return;
    $('ms-day-grid').style.display = e.target.value === 'specific' ? 'grid' : 'none';
  });

  // Day chips
  $('ms-day-grid').addEventListener('click', e => {
    const chip = e.target.closest('.ms-day-chip');
    if (!chip) return;
    const day = parseInt(chip.dataset.day);
    if (_selDays.has(day)) _selDays.delete(day); else _selDays.add(day);
    chip.classList.toggle('active', _selDays.has(day));
  });

  // Holiday toggle
  $('ms-hol-toggle').addEventListener('click', () => {
    _skipHol = !_skipHol;
    $('ms-hol-toggle').classList.toggle('on', _skipHol);
    $('ms-hol-toggle').setAttribute('aria-checked', String(_skipHol));
  });

  // Paid-status → tax interlock
  $('ms-paid-status')?.addEventListener('change', e => {
    const taxSel = $('ms-tax');
    if (!taxSel) return;
    if (e.target.value === 'na') {
      taxSel.value    = 'na';
      taxSel.disabled = true;
    } else {
      taxSel.disabled = false;
    }
  });

  // Online toggle
  $('ms-online').addEventListener('change', e => {
    _isOnline = e.target.checked;
    const placeEl = $('ms-place');
    if (!placeEl) return;
    if (_isOnline) {
      placeEl.disabled    = true;
      placeEl.value       = 'Online';
      placeEl.placeholder = '';
    } else {
      placeEl.disabled    = false;
      placeEl.value       = '';
      placeEl.placeholder = '강의장 주소';
    }
  });

  // Generate preview
  $('ms-gen').addEventListener('click', _handleGenerate);

  // Save
  $('ms-save').addEventListener('click', _handleSave);

  // Fee bidirectional sync + fee-type toggle
  $('ms-fee').addEventListener('input',       () => _syncFee('fee'));
  $('ms-fee-total').addEventListener('input', () => _syncFee('fee-total'));
  $('ms-total').addEventListener('input',     () => _syncFee('total'));
  $('ms-fee-type')?.addEventListener('change', () => _syncFee('fee-type'));

  // Supplies chip input
  $('ms-supplies-wrap')?.addEventListener('click', e => {
    const removeBtn = e.target.closest('.supplies-chip-remove');
    if (removeBtn) {
      const idStr  = removeBtn.dataset.id;
      _msSupplies  = _msSupplies.filter(s => String(s.id) !== idStr);
      _renderMsChips();
      return;
    }
    $('ms-supplies-input')?.focus();
  });
  $('ms-supplies-input')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const parts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    parts.forEach((name, i) => _msSupplies.push({ id: Date.now() + i, name, isChecked: false }));
    _renderMsChips();
    e.target.value = '';
  });
  $('ms-supplies-input')?.addEventListener('input', e => {
    if (!e.target.value.includes(',')) return;
    const parts    = e.target.value.split(',');
    const trailing = parts.pop();
    const names    = parts.map(s => s.trim()).filter(Boolean);
    if (!names.length) { e.target.value = trailing; return; }
    names.forEach((name, i) => _msSupplies.push({ id: Date.now() + i, name, isChecked: false }));
    _renderMsChips();
    e.target.value = trailing.trimStart();
  });

  // Kakao address search
  $('ms-addr-search').addEventListener('click', () => openKakaoAddress('ms-place'));

  // Preview table — delegated input sync
  $('ms-tbody').addEventListener('input', e => {
    const inp = e.target.closest('.ms-p-input');
    if (!inp) return;
    const idx   = parseInt(inp.dataset.idx);
    const field = inp.dataset.f;
    if (isNaN(idx) || !field || !_sessions[idx]) return;
    _sessions[idx][field] = inp.value;
  });

  // Preview table — row add / delete
  $('ms-tbody').addEventListener('click', e => {
    const del = e.target.closest('.ms-row-del');
    if (del) { _deleteRow(parseInt(del.dataset.idx)); return; }
    const add = e.target.closest('.ms-row-add');
    if (add) { _insertRowAfter(parseInt(add.dataset.idx)); return; }
  });

  // Tag picker — shared logic from lectureModal.js
  registerMsBulkTagUpdate(tagId => {
    _msTagId = tagId;
    _sessions.forEach(s => { s.topicTagId = tagId; });
    if ($('ms-tbody')) _reRenderTableBody();
    const defs = getTopicDefaultSupplies(tagId);
    if (defs.length > 0) {
      const _presetNamesLo = new Set(defs.map(d => d.name.trim().toLowerCase()));
      _msSupplies = _msSupplies.filter(s => !_presetNamesLo.has(s.name.trim().toLowerCase()));
      _renderMsChips();
    }
    _msPresets = defs.map((d, i) => ({ id: i + 1, name: d.name, included: true }));
    _renderMsPresets();
  });

  $('ms-supplies-presets-list')?.addEventListener('change', e => {
    const cb = e.target.closest('.supplies-preset-cb');
    if (!cb) return;
    const presetId = Number(cb.dataset.presetId);
    const preset = _msPresets.find(p => p.id === presetId);
    if (preset) {
      preset.included = cb.checked;
      cb.closest('.supplies-preset-item')?.classList.toggle('is-checked', cb.checked);
    }
  });
  bindMsTagPickerEvents();

  // Pending todo — add button & Enter key
  $('ms-todo-add-btn').addEventListener('click', () => {
    const input = $('ms-todo-input');
    const text  = input?.value.trim();
    if (!text) return;
    _msPendingTodos = [
      ..._msPendingTodos,
      {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text, isDone: false, postponeCount: 0,
        deadline: $('ms-todo-due-date')?.value || getTodayString(), lectureId: null, groupId: null,
      },
    ];
    _msRefreshPendingUI?.();
    input.value = '';
    const msDueDateEl = $('ms-todo-due-date');
    if (msDueDateEl) msDueDateEl.value = '';
  });

  $('ms-todo-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('ms-todo-add-btn').click(); }
  });
}

function _syncRec(val) {
  document.getElementById('ms-opt-daily').style.display   = val === 'daily'   ? 'block' : 'none';
  document.getElementById('ms-opt-weekly').style.display  = val === 'weekly'  ? 'block' : 'none';
  document.getElementById('ms-opt-monthly').style.display = val === 'monthly' ? 'block' : 'none';
}

/* ════════════════════════════════════════
   미리보기 생성
════════════════════════════════════════ */
function _handleGenerate() {
  const $ = id => document.getElementById(id);
  const startDate = $('ms-start').value;
  const total     = parseInt($('ms-total').value);
  const rec       = $('ms-rec').value;

  if (!startDate)           { window.showToast?.('시작일을 선택하세요.', 'warn'); return; }
  if (!total || total < 1)  { window.showToast?.('총 회차 수를 입력하세요.', 'warn'); return; }
  if (total > 200)          { window.showToast?.('최대 200회차까지 지원합니다.', 'warn'); return; }

  const _mmChecked = document.querySelector('input[name="ms-mm"]:checked');
  const monthMode = (_mmChecked != null ? _mmChecked.value : 'same');

  if (rec === 'weekly' && _selDow.size === 0) {
    window.showToast?.('요일을 하나 이상 선택하세요.', 'warn'); return;
  }
  if (rec === 'monthly' && monthMode === 'specific' && _selDays.size === 0) {
    window.showToast?.('날짜를 하나 이상 선택하세요.', 'warn'); return;
  }

  _sessions = generateSessions({
    startDate,
    total,
    recurrence:    rec,
    dayInterval:   parseInt($('ms-day-n').value)   || 1,
    weekInterval:  parseInt($('ms-week-n').value)  || 1,
    weekDays:      [..._selDow],
    monthInterval: parseInt($('ms-month-n').value) || 1,
    monthMode,
    specificDays:  [..._selDays],
    skipHolidays:  _skipHol,
  });

  if (_sessions.length === 0) {
    window.showToast?.('일정을 생성할 수 없습니다. 설정을 확인하세요.', 'warn'); return;
  }

  _renderPreview();
}

/* ════════════════════════════════════════
   미리보기 렌더링
════════════════════════════════════════ */
function _renderPreview() {
  const $ = id => document.getElementById(id);
  const defStart = $('ms-ts').value || '09:00';
  const defEnd   = $('ms-te').value || '10:00';

  _sessions.forEach(s => {
    if (s.timeStart === undefined) s.timeStart = defStart;
    if (s.timeEnd   === undefined) s.timeEnd   = defEnd;
    if (s.topic     === undefined) s.topic     = '';
  });

  _reRenderTableBody();
  $('ms-preview').style.display = '';
  $('ms-save').disabled         = false;
  $('ms-save').textContent      = `저장하기 (${_sessions.length}회차)`;
  _syncPaymentDate();
  $('ms-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _reRenderTableBody() {
  const $ = id => document.getElementById(id);

  const hasShifted = _sessions.some(s => s.wasShifted);
  $('ms-hbadge').style.display = hasShifted ? '' : 'none';
  $('ms-obadge').style.display = _isOnline  ? '' : 'none';
  $('ms-pcount').textContent   = `${_sessions.length}회차 생성됨`;
  $('ms-save').textContent     = `저장하기 (${_sessions.length}회차)`;

  $('ms-tbody').innerHTML = _sessions.map((s, i) => {
    const shifted  = s.wasShifted;
    const tip      = shifted ? `title="원래 날짜: ${s.originalDate} (공휴일)"` : '';
    const _foundTag = s.topicTagId != null ? getTopicTags().find(t => t.id === s.topicTagId) : null;
    const tagColor = (_foundTag != null && _foundTag.color != null ? _foundTag.color : '#e5e7eb');

    return `
      <tr class="${shifted ? 'row-shifted' : ''}" data-idx="${i}" ${tip} style="border-left:3px solid ${tagColor}">
        <td><span class="ms-seq${shifted ? ' shifted' : ''}">${s.sessionCurrent}</span></td>
        <td class="ms-td-date">
          <input class="ms-p-input ms-p-date day-input" type="date" value="${s.date}" data-f="date" data-idx="${i}"/>
        </td>
        <td><input class="ms-p-input ms-p-time" type="text" value="${s.timeStart}" data-f="timeStart" data-idx="${i}" maxlength="5" /></td>
        <td><input class="ms-p-input ms-p-time" type="text" value="${s.timeEnd}"   data-f="timeEnd"   data-idx="${i}" maxlength="5" /></td>
        <td><input class="ms-p-input" style="width:100%;min-width:90px" type="text" value="${s.topic || ''}" placeholder="주제 / 메모 (선택)" data-f="topic" data-idx="${i}" /></td>
        <td class="ms-td-actions">
          <button class="ms-row-btn ms-row-add" data-idx="${i}" title="아래에 행 추가">+</button>
          <button class="ms-row-btn ms-row-del" data-idx="${i}" title="행 삭제">✕</button>
        </td>
      </tr>`;
  }).join('');

  initAllDateWithDay(document.getElementById('ms-tbody'));
}

function _resequence() {
  _sessions.forEach((s, i) => { s.sessionCurrent = i + 1; });
}

function _deleteRow(idx) {
  if (_sessions.length <= 1) {
    window.showToast?.('최소 1개 이상의 세션이 필요합니다.', 'warn'); return;
  }
  _sessions.splice(idx, 1);
  _resequence();
  _reRenderTableBody();
}

function _insertRowAfter(idx) {
  const ref     = _sessions[idx];
  const newDate = _offsetDateStr(ref.date, 7);
  _sessions.splice(idx + 1, 0, {
    date:           newDate,
    timeStart:      ref.timeStart,
    timeEnd:        ref.timeEnd,
    topic:          '',
    wasShifted:     false,
    originalDate:   newDate,
    sessionCurrent: 0,
  });
  _resequence();
  _reRenderTableBody();
}

/* ════════════════════════════════════════
   충돌 검사 유틸
════════════════════════════════════════ */
function _findConflictLec(newLec, sameDayRaw, check) {
  if (!sameDayRaw.length) return null;
  const nS = timeToMin(newLec.startTime);
  const nE = timeToMin(newLec.endTime);
  const lf = (l, w) => w === 's'
    ? (l.startTime != null ? l.startTime : (l.timeStart != null ? l.timeStart : ''))
    : (l.endTime   != null ? l.endTime   : (l.timeEnd   != null ? l.timeEnd   : ''));

  if (check.step === 1) {
    return sameDayRaw.find(l => {
      const s = timeToMin(lf(l,'s')), e = timeToMin(lf(l,'e'));
      return Math.max(nS, s) < Math.min(nE, e);
    }) || sameDayRaw[0];
  }
  return sameDayRaw.reduce((best, l) => {
    const s  = timeToMin(lf(l,'s')),    e  = timeToMin(lf(l,'e'));
    const bs = timeToMin(lf(best,'s')), be = timeToMin(lf(best,'e'));
    const dist     = nS >= e  ? nS - e  : s  - nE;
    const bestDist = nS >= be ? nS - be : bs - nE;
    return Math.abs(dist) < Math.abs(bestDist) ? l : best;
  }, sameDayRaw[0]);
}

/* ════════════════════════════════════════
   Firestore 배치 저장
════════════════════════════════════════ */
async function _commitBatch(commonData, sessionTotal) {
  const saveBtn = document.getElementById('ms-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
  try {
    const batch = writeBatch(db);
    const commonForFs = commonData;
    const _lastSession = _sessions[_sessions.length - 1];
    const lastSessionDate = (_lastSession != null ? _lastSession.date : '');
    for (const s of _sessions) {
      const ref = doc(collection(db, 'lectures'));
      const endDate = s.date;
      const paymentDate = commonForFs.settlementCycle
        ? calcPaymentDate(s.date, commonForFs.settlementCycle, lastSessionDate)
        : (commonForFs.paymentDate || null);
      const _sTimeStart = s.timeStart || '';
      const _sTimeEnd   = s.timeEnd   || '';
      batch.set(ref, {
        ...commonForFs,
        startDate: s.date, startTime: _sTimeStart, endDate, endTime: _sTimeEnd,
        date:              s.date,
        endDate,
        paymentDate,
        timeStart:         _sTimeStart,
        timeEnd:           _sTimeEnd,
        topic:             s.topic     || '',
        sessionCurrent:    s.sessionCurrent,
        wasHolidayShifted: (s.wasShifted != null ? s.wasShifted : false),
        createdAt:         serverTimestamp(),
      });
    }
    await batch.commit();

    if (_msPendingTodos.length > 0) {
      const uid = _getCtx?.()?.currentUser?.uid;
      if (uid && commonData.groupId) {
        await Promise.all(_msPendingTodos.map(t => addTodo(uid, t.text, null, commonData.groupId, t.deadline || null)));
      }
      _msPendingTodos = [];
    }

    window.showToast?.(`${sessionTotal}회차 강의가 등록되었습니다! 🎉`, 'success');
    _close();
  } catch (err) {
    console.error('[강비서] 연속 강의 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다.', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = `저장하기 (${sessionTotal}회차)`; }
  }
}

/* ════════════════════════════════════════
   충돌 확인 모달
════════════════════════════════════════ */
function _openConflictModal({ session, check, conflictLec, common, sessionTotal }) {
  const bd = document.getElementById('ms-cf-backdrop');
  if (!bd) return;

  const stepLabel = check.step === 1
    ? '시간이 직접 겹칩니다'
    : check.step === 2
    ? '버퍼 시간이 부족합니다'
    : check.isFallback
    ? '이동 시간 포함 시 도착이 늦습니다 (직선거리 추정)'
    : '이동 시간 포함 시 도착이 늦습니다';

  const { full: dateFull } = formatDateKo(session.date);
  const cTitle  = conflictLec?.title  || '(제목 없음)';
  const cClient = conflictLec?.client || '—';
  const cPlace  = conflictLec?.isOnline ? '💻 온라인 수업' : (conflictLec?.place || '—');
  const cStart  = conflictLec != null ? (conflictLec.startTime != null ? conflictLec.startTime : (conflictLec.timeStart != null ? conflictLec.timeStart : '?')) : '?';
  const cEnd    = conflictLec != null ? (conflictLec.endTime   != null ? conflictLec.endTime   : (conflictLec.timeEnd   != null ? conflictLec.timeEnd   : '?')) : '?';

  bd.innerHTML = `
    <div class="ms-cf-modal">
      <div class="ms-cf-head">
        <div>
          <p class="ms-cf-title">⚠️ 일정 충돌 감지</p>
          <p class="ms-cf-sub">${escapeHtml(stepLabel)}</p>
        </div>
        <button class="ms-cf-x" id="ms-cf-x" aria-label="닫기">✕</button>
      </div>
      <div class="ms-cf-body">
        <p class="ms-cf-section-label">충돌 발생 세션</p>
        <div class="ms-cf-card ms-cf-card--new">
          <span class="ms-cf-badge">${session.sessionCurrent}회차</span>
          <p class="ms-cf-date">${escapeHtml(dateFull)}</p>
          <p class="ms-cf-time">${escapeHtml(session.timeStart || '?')} ~ ${escapeHtml(session.timeEnd || '?')}</p>
          <p class="ms-cf-place">📍 ${escapeHtml(common.place || '—')}</p>
        </div>
        <p class="ms-cf-vs">VS</p>
        <p class="ms-cf-section-label">기존 강의</p>
        <div class="ms-cf-card ms-cf-card--ext">
          <p class="ms-cf-lec-title">${escapeHtml(cTitle)}</p>
          <p class="ms-cf-time">${escapeHtml(cStart)} ~ ${escapeHtml(cEnd)}</p>
          <p class="ms-cf-client">🏢 ${escapeHtml(cClient)}</p>
          <p class="ms-cf-place">📍 ${escapeHtml(cPlace)}</p>
        </div>
      </div>
      <div class="ms-cf-foot">
        <button class="ms-cf-btn ms-cf-btn--back"    id="ms-cf-back">← 수정하기</button>
        <button class="ms-cf-btn ms-cf-btn--pending" id="ms-cf-pending">보류로 저장</button>
      </div>
    </div>`;

  requestAnimationFrame(() => bd.classList.add('open'));

  const close = () => {
    bd.classList.remove('open');
    setTimeout(() => { bd.innerHTML = ''; }, 200);
  };

  document.getElementById('ms-cf-x').addEventListener('click', close);
  bd.addEventListener('click', e => { if (e.target === bd) close(); });

  const _escKey = e => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', _escKey); }
  };
  document.addEventListener('keydown', _escKey);

  document.getElementById('ms-cf-back').addEventListener('click', close);

  document.getElementById('ms-cf-pending').addEventListener('click', async () => {
    const btn = document.getElementById('ms-cf-pending');
    btn.disabled    = true;
    btn.textContent = '저장 중...';
    await _commitBatch({ ...common, progressStatus: 'onhold' }, sessionTotal);
    close();
  });
}

/* ════════════════════════════════════════
   Firestore 저장 (writeBatch)
════════════════════════════════════════ */
async function _handleSave() {
  const ctx = _getCtx?.();
  const currentUser = ctx?.currentUser;
  if (!currentUser || _sessions.length === 0) return;

  const $ = id => document.getElementById(id);
  const saveBtn = $('ms-save');
  saveBtn.disabled    = true;
  saveBtn.textContent = '저장 중...';

  // Flush any pending DOM edits
  $('ms-tbody').querySelectorAll('.ms-p-input').forEach(inp => {
    const idx   = parseInt(inp.dataset.idx);
    const field = inp.dataset.f;
    if (isNaN(idx) || !field || !_sessions[idx]) return;
    _sessions[idx][field] = inp.value;
  });

  const _restoreBtn = () => {
    saveBtn.disabled    = false;
    saveBtn.textContent = `저장하기 (${_sessions.length}회차)`;
  };

  const title = $('ms-title').value.trim();
  if (!title)  { window.showToast?.('강의명을 입력하세요.', 'warn'); _restoreBtn(); return; }

  const client = $('ms-client').value.trim();
  if (!client) { window.showToast?.('고객사를 입력하세요.', 'warn'); _restoreBtn(); return; }

  const place = $('ms-place').value.trim();
  if (!place)  { window.showToast?.('강의장 주소를 입력하세요.', 'warn'); _restoreBtn(); return; }

  const _msIncluded    = _msPresets.filter(p => p.included);
  const _msMerged      = [
    ..._msIncluded.map((p, i) => ({ id: i + 1, name: p.name, isChecked: false })),
    ..._msSupplies.map((s, j) => ({ id: _msIncluded.length + j + 1, name: s.name, isChecked: false })),
  ];
  const groupId        = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sessionTotal   = _sessions.length;
  const _psEl = $('ms-paid-status');
  const _paidStatusVal = (_psEl != null ? _psEl.value : 'false');
  const isPaid         = _paidStatusVal === 'true';
  const paidStatus     = _paidStatusVal;
  const taxType        = $('ms-tax')?.value || 'income3_3';
  // Fee normalization: derive session fee from total if only total was entered
  const _rawFee      = parseFloat($('ms-fee').value)       || 0;
  const _rawFeeTotal = parseFloat($('ms-fee-total').value) || 0;
  const feePerSession = (_rawFee === 0 && _rawFeeTotal > 0 && sessionTotal > 0)
    ? _rawFeeTotal / sessionTotal
    : _rawFee;
  const feeTotalCalc = _rawFeeTotal || (feePerSession * sessionTotal);

  const settlementCycle = $('ms-settlement-cycle').value || '';

  const common = {
    uid:              currentUser.uid,
    groupId,
    title,
    client,
    place,
    isOnline:         _isOnline,
    feeType:          $('ms-fee-type')?.value || 'unit',
    fee:              feePerSession,
    feeAmount:        feeTotalCalc,
    settlementCycle,
    progressStatus:   $('ms-progress').value || PROGRESS_SCHEDULED,
    topicTagId:       _msTagId,
    sessionTotal,
    isPaid,
    paidStatus,
    taxType,
    paymentDate:      $('ms-payment-date')?.value || null,
    isDocumented:     false,
    isFullDay:        $('ms-full-day')?.checked ?? false,
    classroom:        $('ms-classroom').value.trim(),
    parking:          $('ms-parking').value.trim(),
    setupTime:        $('ms-setup-time').value.trim(),
    wrapupTime:       $('ms-wrapup-time').value.trim(),
    participants:     Number($('ms-participants').value) || 0,
    groupInfo:        $('ms-group-info').value.trim(),
    supplies:         _msMerged,
    managerName:      $('ms-manager-name').value.trim(),
    managerPhone:     $('ms-manager-phone').value.trim(),
    managerEmail:     $('ms-manager-email').value.trim(),
  };

  const { allLectures = [] } = ctx;
  const setupMin    = parseInt(common.setupTime)  || 0;
  const wrapupMin   = parseInt(common.wrapupTime) || 0;
  const bufferInput = parseInt($('ms-buffer-time')?.value);
  let _msTransport = 'car';
  try {
    const _msRaw = JSON.parse(localStorage.getItem('kangbiseo_device') ?? 'null');
    _msTransport = _msRaw?.scheduler?.transport || 'car';
  } catch {}
  const settings    = {
    bufferTime: (!isNaN(bufferInput) && bufferInput > 0) ? bufferInput : _schedulerDefaults.bufferTime,
    setupTime:  _schedulerDefaults.setupTime  || 20,
    wrapupTime: _schedulerDefaults.wrapupTime || 15,
    transport:  _msTransport,
  };

  for (let i = 0; i < _sessions.length; i++) {
    const s = _sessions[i];
    saveBtn.textContent = `충돌 검사 중… (${i + 1}/${sessionTotal})`;

    const sameDayRaw   = allLectures.filter(l => l.date === s.date);
    const existingLecs = sameDayRaw.map(l => ({
      date:       l.date,
      startTime:  (l.startTime  != null ? l.startTime  : (l.timeStart != null ? l.timeStart : '')),
      endTime:    (l.endTime    != null ? l.endTime    : (l.timeEnd   != null ? l.timeEnd   : '')),
      place:      l.isOnline ? 'Online' : (l.place != null ? l.place : ''),
      isOnline:   (l.isOnline   != null ? l.isOnline   : false),
      setupTime:  (l.setupTime  != null ? l.setupTime  : 0),
      wrapupTime: (l.wrapupTime != null ? l.wrapupTime : 0),
    }));

    const newLec = {
      date:       s.date,
      startTime:  s.timeStart || '',
      endTime:    s.timeEnd   || '',
      place:      _isOnline ? 'Online' : place,
      isOnline:   _isOnline,
      isFullDay:  common.isFullDay ?? false,
      setupTime:  setupMin,
      wrapupTime: wrapupMin,
    };

    const sessionSettings = { ...settings, originAddr: resolveOriginAddr(s.date) };

    let check;
    try {
      check = await checkScheduleConflict(newLec, existingLecs, sessionSettings, allLectures);
    } catch (err) {
      console.error('[강비서] 충돌 검사 오류:', err);
      window.showToast?.('일정 충돌 검사 중 오류가 발생했습니다.', 'error');
      _restoreBtn();
      return;
    }

    if (check.status === 'risk') {
      const conflictLec = _findConflictLec(newLec, sameDayRaw, check);
      _restoreBtn();
      _openConflictModal({ session: s, check, conflictLec, common, sessionTotal });
      return;
    }
    if (check.status === 'warning') {
      const toast = formatConflictWarning(check);
      if (toast) window.showToast?.(toast.message, toast.type);
    }
  }

  await _commitBatch(common, sessionTotal);
}
