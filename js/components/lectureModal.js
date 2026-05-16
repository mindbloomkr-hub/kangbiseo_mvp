// js/components/lectureModal.js — 강의 모달 공통 모듈 (상세보기 + CRUD)

// 1. 모든 import 문 (파일 최상단에 모아두세요)
import { db } from '../api.js';
import { addTodo } from '../services/todoService.js';
import { renderTodoUI } from './todoComponent.js';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  TAX_LABEL, PROGRESS_LABEL, STATUS_META,
  escapeHtml, formatDateKo, calcDuration, classifyStatus,
  buildTimeOptions, updateDurationDisplay, syncEndTimeOptions, initTimeSelects,
  checkScheduleConflict, _geocode, positionPanel, getTodayString,
  timeToMin, minToTime, calcPaymentDate, resolveOriginAddr, formatConflictWarning,
} from '../utils.js';
import { REVENUE_UNIT, PROGRESS_SCHEDULED } from '../constants.js';
import { openKakaoAddress } from '../services/kakaoAddressService.js';

// ---------------------------------------------------------
// 2. [중요] window에 도구 등록 (반드시 import 문 아래에 위치!)
// ---------------------------------------------------------
try {
  // 개별 통로 (기존 호환성 유지)
  window._temp_db = db;
  window._temp_collection = collection;
  window._temp_addDoc = addDoc;
  window._temp_serverTimestamp = serverTimestamp;
  window.updateDoc = updateDoc; // 이전에 필요했던 도구들
  window.doc = doc;

  // 묶음 통로 (mypage.js 등에서 사용)
  window.FirebaseFirestore = {
    query, 
    where, 
    getDocs, 
    deleteDoc, 
    doc, 
    addDoc, 
    updateDoc, 
    serverTimestamp
  };

  console.log('[강비서] ✅ 모든 Firebase 도구가 window에 안전하게 로드되었습니다.');
} catch (e) {
  console.error('[강비서] ❌ 도구 로딩 실패:', e.message);
}


/* ════════════════════════════════════════
   모듈 상태
════════════════════════════════════════ */
let _activeModalId  = null;
let _editingLecId   = null;
let _getCtx         = null;
let _classifyFn     = classifyStatus;
let _statusMeta     = STATUS_META;
let _topicTags      = [];

// Lecture-scoped todo state
let _unsubLecTodos    = null;
let _pendingTodos     = [];      // todos staged while adding a new lecture
let _refreshPendingUI = null;    // refresh fn returned by renderTodoUI (pending mode)

// Supplies chip input state
let _afSupplies = []; // [{id, name, isChecked}] custom additions
let _afPresets  = []; // [{id, name, included}] topic-default items (shown as checkboxes)

export function getTopicTags() { return _topicTags; }

let _msBulkTagUpdate = null;
export function registerMsBulkTagUpdate(fn) { _msBulkTagUpdate = fn; }
export function refreshMsTagPicker(selectedId) { _refreshTagPicker(selectedId, 'ms'); }
export function bindMsTagPickerEvents()         { _bindTagPickerEvents('ms'); }

async function _loadTopicTags(uid) {
  if (!uid) return;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      _topicTags = Array.isArray(d.topicTags) ? d.topicTags
                 : (Array.isArray(d.topics)    ? d.topics : []);
    }
  } catch { /* keep existing cache on error */ }
}

/* ════════════════════════════════════════
   초기화
════════════════════════════════════════ */
export async function initLectureModal(getCtx, opts = {}) {
  _getCtx     = getCtx;
  if (opts.classifyStatus) _classifyFn = opts.classifyStatus;
  if (opts.statusMeta)     _statusMeta = opts.statusMeta;
  initTimeSelects();
  _bindEvents();
  // Eagerly load topicTags so color functions work before first modal open
  const uid = _getCtx?.()?.currentUser?.uid;
  if (uid) await _loadTopicTags(uid);
}

/* ════════════════════════════════════════
   공개 API
════════════════════════════════════════ */
export async function openModal(id) {
  const { allLectures, currentUser } = _getCtx();
  const lec = allLectures.find(l => l.id === id);
  if (!lec || !_backdrop()) return;
  await _loadTopicTags(currentUser?.uid);
  _activeModalId = id;
  _editingLecId  = null;
  _populateView(lec);
  _switchMode('view');
  _backdrop().classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close-btn')?.focus();

  // Subscribe to this lecture's todos (live mode via renderTodoUI)
  if (currentUser) {
    _unsubLecTodos?.();
    const listEl = document.getElementById('v-todo-list');
    const gId    = (lec.groupId != null ? lec.groupId : null);
    _unsubLecTodos = renderTodoUI(listEl, gId ? null : id, {
      uid:         currentUser.uid,
      allLectures: _getCtx().allLectures,
      topicTags:   _topicTags,
      groupId:     gId,
    });
  }
}

export async function openAddModal() {
  if (!_backdrop()) return;
  _activeModalId = null;
  _editingLecId  = null;
  const uid = _getCtx?.()?.currentUser?.uid;
  await _loadTopicTags(uid);

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
  if (progressSel) progressSel.value = PROGRESS_SCHEDULED;
  const paidSel = document.getElementById('af-paid-status');
  if (paidSel) paidSel.value = 'false';
  const cycleSel = document.getElementById('af-settlement-cycle');
  if (cycleSel) cycleSel.value = '';
  const taxSel = document.getElementById('af-tax');
  if (taxSel) { taxSel.value = 'income3_3'; taxSel.disabled = false; }

  var _devRaw0 = localStorage.getItem('kangbiseo_device');
  var _devData0 = JSON.parse(_devRaw0 != null ? _devRaw0 : 'null');
  const sched    = (_devData0 != null && _devData0.scheduler != null ? _devData0.scheduler : {});
  const setupEl  = document.getElementById('af-setup-time');
  const wrapupEl = document.getElementById('af-wrapup-time');
  if (setupEl)  setupEl.value  = (sched.setupTime  != null ? sched.setupTime  : 20);
  if (wrapupEl) wrapupEl.value = (sched.wrapupTime != null ? sched.wrapupTime : 15);

  _refreshTagPicker(null);

  _afSupplies = [];
  _renderAfChips();
  const _initDefs = getTopicDefaultSupplies(null);
  _afPresets = _initDefs.map((d, i) => ({ id: i + 1, name: d.name, included: true }));
  _renderAfPresets();
  const _addSaveWrap = document.getElementById('af-supplies-quick-save-wrap');
  if (_addSaveWrap) _addSaveWrap.style.display = 'none';
  const _addSaveCb = document.getElementById('af-supplies-save-default');
  if (_addSaveCb) _addSaveCb.checked = false;

  const placeEl = document.getElementById('af-place');
  if (placeEl) { placeEl.disabled = false; placeEl.placeholder = '예) 서울 강남구 SSDC 4F'; }

  const endDateEl = document.getElementById('af-end-date');
  if (endDateEl && af) endDateEl.value = af.value;

  const sessionCurrentEl = document.getElementById('af-session-current');
  if (sessionCurrentEl) sessionCurrentEl.value = '';
  const sessionTotalEl2 = document.getElementById('af-session-total');
  if (sessionTotalEl2) sessionTotalEl2.value = '';
  const feeTotalWrapEl2 = document.getElementById('af-fee-total-wrap');
  if (feeTotalWrapEl2) feeTotalWrapEl2.style.display = 'none';
  const feeTotalInputEl = document.getElementById('af-fee-total');
  if (feeTotalInputEl) feeTotalInputEl.value = '';

  // Pending todo UI for new lecture
  _pendingTodos = [];
  const formTodoList = document.getElementById('af-todo-list');
  _refreshPendingUI = renderTodoUI(formTodoList, null, {
    getPendingTodos:  () => _pendingTodos,
    onPendingChange:  updated => { _pendingTodos = updated; },
  });

  _switchMode('form');
  _backdrop().classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('af-title')?.focus();
}

/* ════════════════════════════════════════
   내부 헬퍼
════════════════════════════════════════ */
const _backdrop  = () => document.getElementById('modal-backdrop');
const _confirmBd = () => document.getElementById('confirm-backdrop');

function _parseSupplies(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s, i) => ({
      id:        s.id != null ? s.id : (i + 1),
      name:      typeof s === 'string' ? s : (s.name || ''),
      isChecked: s.isChecked ?? false,
    })).filter(s => s.name);
  }
  return String(raw).split(/[,;]+/).map(s => s.trim()).filter(Boolean)
    .map((name, i) => ({ id: i + 1, name, isChecked: false }));
}

function _renderAfChips() {
  const list = document.getElementById('af-supplies-chip-list');
  if (!list) return;
  list.innerHTML = _afSupplies.map(item =>
    `<span class="supplies-chip" data-id="${item.id}">` +
    `${escapeHtml(item.name)}` +
    `<button type="button" class="supplies-chip-remove" data-id="${item.id}" aria-label="삭제">×</button>` +
    `</span>`
  ).join('');
}

function _renderAfPresets() {
  const wrap = document.getElementById('af-supplies-presets-wrap');
  const list = document.getElementById('af-supplies-presets-list');
  if (!wrap || !list) return;
  if (_afPresets.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  list.innerHTML = _afPresets.map(item =>
    `<label class="supplies-preset-item${item.included ? ' is-checked' : ''}" data-preset-id="${item.id}">` +
    `<input type="checkbox" class="supplies-preset-cb" data-preset-id="${item.id}" ${item.included ? 'checked' : ''} />` +
    `<span>${escapeHtml(item.name)}</span></label>`
  ).join('');
}

export function getTopicDefaultSupplies(tagId) {
  try {
    const raw = localStorage.getItem('kangbiseo_topic_supplies');
    if (!raw) return [];
    const map = JSON.parse(raw);
    // null tagId = "일반 강의" → stored under 'none'
    const key = tagId == null ? 'none' : String(tagId);
    return Array.isArray(map[key]) ? map[key] : [];
  } catch { return []; }
}

function _saveTopicDefaultSupplies(tagId, items) {
  if (tagId == null) return;
  try {
    const raw = localStorage.getItem('kangbiseo_topic_supplies');
    const map = raw ? JSON.parse(raw) : {};
    map[String(tagId)] = items.map(({ name }) => ({ name }));
    localStorage.setItem('kangbiseo_topic_supplies', JSON.stringify(map));
  } catch {}
}

function _closeModal() {
  _backdrop()?.classList.remove('open');
  document.body.style.overflow = '';
  _activeModalId    = null;
  _editingLecId     = null;
  _unsubLecTodos?.();
  _unsubLecTodos    = null;
  _pendingTodos     = [];
  _refreshPendingUI = null;
}

function _closeConfirm() {
  _confirmBd()?.classList.remove('open');
}

function _switchMode(mode) {
  const isView = (mode === 'view');
  const viewPanel    = document.getElementById('view-panel');
  const formPanel    = document.getElementById('form-panel');
  const viewFooter   = document.getElementById('view-footer');
  const formFooter   = document.getElementById('form-footer');
  const metaRow      = document.getElementById('modal-meta-row');
  const formSubtitle = document.getElementById('modal-form-subtitle');

  if (viewPanel)    viewPanel.style.display    = isView ? '' : 'none';
  if (formPanel)    formPanel.style.display    = isView ? 'none' : '';
  if (viewFooter)   viewFooter.style.display   = isView ? 'flex' : 'none';
  if (formFooter)   formFooter.style.display   = isView ? 'none' : 'flex';
  if (metaRow)      metaRow.style.display      = isView ? '' : 'none';
  if (formSubtitle) formSubtitle.style.display = isView ? 'none' : '';
}

function _syncFeeTotalForm() {
  const fee          = parseFloat(document.getElementById('af-fee')?.value) || 0;
  const sessionTotal = parseInt(document.getElementById('af-session-total')?.value) || 0;
  const wrap         = document.getElementById('af-fee-total-wrap');
  const feeTotalEl   = document.getElementById('af-fee-total');
  if (!wrap || !feeTotalEl) return;
  if (sessionTotal > 1) {
    wrap.style.display = '';
    feeTotalEl.value   = fee > 0 ? String(fee * sessionTotal) : '';
  } else {
    wrap.style.display = 'none';
    feeTotalEl.value   = '';
  }
}

function _populateView(lec) {
  if (!lec) return;
  const status = _classifyFn(lec);
  const meta   = _statusMeta[status] || { label: status, cls: '' };

  const startDate  = (lec.startDate != null ? lec.startDate : lec.date);
  const endDate    = (lec.endDate   != null ? lec.endDate   : lec.date);
  const timeStart  = (lec.startTime != null ? lec.startTime : (lec.timeStart != null ? lec.timeStart : ''));
  const timeEnd    = (lec.endTime   != null ? lec.endTime   : (lec.timeEnd   != null ? lec.timeEnd   : ''));
  const isCrossDay = startDate !== endDate;
  const { full: startFull } = formatDateKo(startDate);
  const endFull = isCrossDay ? formatDateKo(endDate).full : '';

  document.getElementById('modal-title').textContent       = lec.title || '(제목 없음)';
  document.getElementById('modal-badge').className         = `lec-badge ${meta.cls}`;
  document.getElementById('modal-badge').textContent       = meta.label;
  document.getElementById('modal-date-meta').textContent   = isCrossDay
    ? `${startFull} ${timeStart} ~ ${endFull} ${timeEnd}`
    : `${startFull} · ${timeStart}~${timeEnd}`;
  document.getElementById('modal-client-meta').textContent = lec.client || '—';

  const vDatetimeWrap = document.getElementById('v-datetime-wrap');
  const vDatetimeEl   = document.getElementById('v-datetime-display');
  const vDateItem     = document.getElementById('v-date-item');
  const vTimeItem     = document.getElementById('v-time-item');

  if (isCrossDay) {
    if (vDatetimeWrap) vDatetimeWrap.style.display = '';
    if (vDateItem)     vDateItem.style.display     = 'none';
    if (vTimeItem)     vTimeItem.style.display     = 'none';
    if (vDatetimeEl)   vDatetimeEl.textContent     = `${startFull} ${timeStart} ~ ${endFull} ${timeEnd}`;
  } else {
    if (vDatetimeWrap) vDatetimeWrap.style.display = 'none';
    if (vDateItem)     vDateItem.style.display     = '';
    if (vTimeItem)     vTimeItem.style.display     = '';
    document.getElementById('v-date').textContent = startFull;
    document.getElementById('v-time').textContent = `${timeStart} ~ ${timeEnd}`;
  }
  document.getElementById('v-total-duration').textContent = calcDuration(startDate, timeStart, endDate, timeEnd);
  document.getElementById('v-title').textContent          = lec.title  || '—';
  document.getElementById('v-client').textContent         = lec.client || '—';
  document.getElementById('v-fee').textContent            = `₩${((Number(lec.fee) || 0) * REVENUE_UNIT).toLocaleString()}`;

  const _feeTotalWrap = document.getElementById('v-fee-total-wrap');
  const _feeTotalEl   = document.getElementById('v-fee-total');
  if (_feeTotalWrap) {
    if ((lec.sessionTotal || 0) > 1) {
      _feeTotalWrap.style.display = '';
      if (_feeTotalEl) {
        const feeTotal = lec.feeAmount != null ? lec.feeAmount : ((lec.fee || 0) * (lec.sessionTotal || 1));
        _feeTotalEl.textContent = `₩${((Number(feeTotal) || 0) * REVENUE_UNIT).toLocaleString()}`;
      }
    } else {
      _feeTotalWrap.style.display = 'none';
    }
  }

  document.getElementById('v-session-current').textContent = lec.sessionCurrent ? `${lec.sessionCurrent}회` : '—';
  document.getElementById('v-session-total').textContent   = lec.sessionTotal   ? `${lec.sessionTotal}회`   : '—';
  document.getElementById('v-participants').textContent    = lec.participants    ? `${lec.participants}명`   : '—';
  document.getElementById('v-group-info').textContent      = lec.groupInfo      || '—';
  document.getElementById('v-topic').textContent           = lec.topic          || '—';
  const _tagEl = document.getElementById('v-topic-tag');
  if (_tagEl) {
    const _tag = lec.topicTagId != null ? _topicTags.find(t => t.id === lec.topicTagId) : null;
    if (_tag) {
      _tagEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:20px;background:${escapeHtml(_tag.color)};color:#fff;font-size:12px;font-weight:600;">${escapeHtml(_tag.name)}</span>`;
    } else {
      _tagEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:20px;background:#e5e7eb;color:#6b7280;font-size:12px;font-weight:600;">일반 강의</span>`;
    }
  }
  document.getElementById('v-setup-time').textContent      = lec.setupTime  != null ? `${lec.setupTime}분`  : '—';
  document.getElementById('v-wrapup-time').textContent     = lec.wrapupTime != null ? `${lec.wrapupTime}분` : '—';
  const _supList = _parseSupplies(lec.supplies);
  const _supEl   = document.getElementById('v-supplies');
  if (_supEl) {
    if (_supList.length === 0) {
      _supEl.textContent = '—';
    } else {
      _supEl.innerHTML = _supList.map(s =>
        `<span style="display:inline-block;margin:2px 4px 2px 0;padding:1px 8px;background:#fef3c7;border:1px solid #fde68a;border-radius:20px;font-size:11px;">${escapeHtml(s.name)}</span>`
      ).join('');
    }
  }
  document.getElementById('v-place').textContent           = lec.isOnline ? '💻 온라인 수업' : (lec.place || '—');
  document.getElementById('v-classroom').textContent       = lec.classroom      || '—';
  document.getElementById('v-parking').textContent         = lec.parkingInfo    || '—';

  const mgrName  = lec.managerName  || '';
  const mgrPhone = lec.managerPhone || '';
  const mgrEmail = lec.managerEmail || '';

  document.getElementById('v-mgr-avatar').textContent     = mgrName ? mgrName.charAt(0) : '담';
  document.getElementById('v-mgr-name').textContent       = mgrName  || '담당자 미등록';
  document.getElementById('v-mgr-sub').textContent        = mgrPhone || '연락처 미등록';
  document.getElementById('v-mgr-email-text').textContent = mgrEmail || '—';

  const phoneLink = document.getElementById('v-mgr-phone');
  if (mgrPhone) { phoneLink.href = `tel:${mgrPhone}`;    phoneLink.style.opacity = ''; phoneLink.style.pointerEvents = ''; }
  else          { phoneLink.href = '#'; phoneLink.style.opacity = '0.35'; phoneLink.style.pointerEvents = 'none'; }

  const emailLink = document.getElementById('v-mgr-email-link');
  if (mgrEmail) { emailLink.href = `mailto:${mgrEmail}`; emailLink.style.opacity = ''; emailLink.style.pointerEvents = ''; }
  else          { emailLink.href = '#'; emailLink.style.opacity = '0.35'; emailLink.style.pointerEvents = 'none'; }

  document.getElementById('v-progress').textContent     = PROGRESS_LABEL[lec.progressStatus || 'scheduled'] || '—';
  const paidEl = document.getElementById('v-paid-status');
  const _paidStatus = (lec.paidStatus != null ? lec.paidStatus : (lec.isPaid ? 'true' : 'false'));
  if (_paidStatus === 'na') {
    paidEl.textContent = '— 해당없음';
    paidEl.className   = 'modal-info-value paid-badge paid-badge--na';
  } else if (_paidStatus === 'true') {
    paidEl.textContent = '✅ 입금 완료';
    paidEl.className   = 'modal-info-value paid-badge paid-badge--paid';
  } else {
    paidEl.textContent = '❌ 미입금';
    paidEl.className   = 'modal-info-value paid-badge paid-badge--unpaid';
  }
  document.getElementById('v-payment-date').textContent = lec.paymentDate || '미정';
  document.getElementById('v-tax').textContent          = TAX_LABEL[lec.taxType] || '—';

  const memoEl = document.getElementById('v-memo');
  if (lec.memo) { memoEl.textContent = lec.memo; memoEl.classList.remove('is-empty'); }
  else          { memoEl.textContent = '메모 없음'; memoEl.classList.add('is-empty'); }
}

function _populateForm(lec) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val != null ? val : ''); };
  set('af-date',     (lec.startDate != null ? lec.startDate : lec.date));
  set('af-title',           lec.title);
  set('af-client',          lec.client);
  set('af-fee',             lec.fee);
  set('af-session-current', lec.sessionCurrent);
  set('af-session-total',   lec.sessionTotal);
  set('af-participants',    lec.participants);
  set('af-group-info',      lec.groupInfo);
  set('af-topic',           lec.topic);
  _refreshTagPicker(lec.topicTagId);
  set('af-setup-time',      (lec.setupTime  != null ? lec.setupTime  : ''));
  set('af-wrapup-time',     (lec.wrapupTime != null ? lec.wrapupTime : ''));
  _afSupplies = _parseSupplies(lec.supplies);
  _renderAfChips();
  _afPresets = [];
  _renderAfPresets();
  const _fmQsWrap = document.getElementById('af-supplies-quick-save-wrap');
  if (_fmQsWrap) _fmQsWrap.style.display = lec.topicTagId != null ? '' : 'none';
  const _fmQsCb = document.getElementById('af-supplies-save-default');
  if (_fmQsCb) _fmQsCb.checked = false;
  const onlineCb  = document.getElementById('af-online');
  const fullDayCb = document.getElementById('af-full-day');
  const placeEl   = document.getElementById('af-place');
  if (onlineCb)  onlineCb.checked  = (lec.isOnline  != null ? lec.isOnline  : false);
  if (fullDayCb) fullDayCb.checked = (lec.isFullDay != null ? lec.isFullDay : false);
  if (placeEl) {
    placeEl.disabled    = (lec.isOnline != null ? lec.isOnline : false);
    placeEl.value       = lec.isOnline ? '' : (lec.place != null ? lec.place : '');
    placeEl.placeholder = lec.isOnline ? '' : '예) 서울 강남구 SSDC 4F';
  }
  set('af-end-date', (lec.endDate != null ? lec.endDate : (lec.date != null ? lec.date : '')));

  set('af-classroom',       lec.classroom);
  set('af-parking',         lec.parkingInfo);
  set('af-manager-name',    lec.managerName);
  set('af-manager-phone',   lec.managerPhone);
  set('af-manager-email',   lec.managerEmail);
  set('af-progress',          lec.progressStatus || 'scheduled');
  set('af-settlement-cycle',  lec.settlementCycle || '');
  set('af-payment-date',      lec.paymentDate);
  set('af-memo',              lec.memo);

  const _startDate  = (lec.startDate != null ? lec.startDate : (lec.date      != null ? lec.date      : ''));
  const _endDate    = (lec.endDate   != null ? lec.endDate   : (lec.date      != null ? lec.date      : ''));
  const _timeStart  = (lec.startTime != null ? lec.startTime : (lec.timeStart != null ? lec.timeStart : ''));
  const _timeEnd    = (lec.endTime   != null ? lec.endTime   : (lec.timeEnd   != null ? lec.timeEnd   : ''));
  const _isCrossDay = _startDate !== _endDate;
  const startSel = document.getElementById('af-time-start');
  if (startSel) { startSel.innerHTML = buildTimeOptions(); startSel.value = _timeStart; }
  syncEndTimeOptions(_timeEnd, _isCrossDay);
  updateDurationDisplay();
  _syncFeeTotalForm();

  const paidSel = document.getElementById('af-paid-status');
  const paidStatusVal = (lec.paidStatus != null ? lec.paidStatus : (lec.isPaid ? 'true' : 'false'));
  if (paidSel) paidSel.value = paidStatusVal;
  const taxSel = document.getElementById('af-tax');
  if (taxSel) {
    if (paidStatusVal === 'na') {
      taxSel.value    = 'na';
      taxSel.disabled = true;
    } else {
      taxSel.value    = lec.taxType || 'income3_3';
      taxSel.disabled = false;
    }
  }
}

/* ════════════════════════════════════════
   강의 주제 카테고리 피커 — 커스텀 드롭다운
════════════════════════════════════════ */
const _TAG_COLORS = [
  '#2563c4', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#374151',
];
let _newTagColor = _TAG_COLORS[0];


function _refreshTagPicker(selectedId, prefix = 'lm') {
  const listEl = document.getElementById(`${prefix}-tag-option-list`);
  if (!listEl) return;

  const noneHtml = `<div class="lm-tag-option lm-tag-option-none${selectedId == null ? ' selected' : ''}"
    data-tag-id="" role="option" aria-selected="${selectedId == null}">
    <span class="lm-tag-option-dot"></span><span>일반 강의</span>
  </div>`;

  const tagsHtml = _topicTags.map(t => `
    <div class="lm-tag-option${t.id === selectedId ? ' selected' : ''}"
         data-tag-id="${t.id}" role="option" aria-selected="${t.id === selectedId}">
      <span class="lm-tag-option-dot" style="background:${escapeHtml(t.color)};"></span>
      <span>${escapeHtml(t.name)}</span>
    </div>`).join('');

  listEl.innerHTML = noneHtml + tagsHtml;
  _applyTagTrigger(selectedId, prefix);
}

function _applyTagTrigger(tagId, prefix = 'lm') {
  const tag = tagId != null ? _topicTags.find(t => t.id === tagId) : null;

  const swatchEl = document.getElementById(`${prefix}-tag-swatch`);
  const labelEl  = document.getElementById(`${prefix}-tag-trigger-label`);
  const hiddenEl = document.getElementById(prefix === 'lm' ? 'af-topic-tag' : `${prefix}-tag-id`);

  if (swatchEl) swatchEl.style.background = (tag != null && tag.color != null ? tag.color : '#fff');
  if (labelEl)  labelEl.textContent        = tag ? tag.name : '일반 강의';
  if (hiddenEl) hiddenEl.value             = tagId != null ? String(tagId) : '';

  document.querySelectorAll(`#${prefix}-tag-option-list .lm-tag-option`).forEach(el => {
    const raw = el.dataset.tagId;
    const match = (raw === '' && tagId == null) || (raw !== '' && Number(raw) === tagId);
    el.classList.toggle('selected', match);
    el.setAttribute('aria-selected', String(match));
  });

  if (prefix === 'ms') _msBulkTagUpdate?.(tagId);

  if (prefix === 'lm') {
    const _qs = document.getElementById('af-supplies-quick-save-wrap');
    if (_qs) _qs.style.display = tagId != null ? '' : 'none';
    const _defs = getTopicDefaultSupplies(tagId);
    _afPresets = _defs.map((d, i) => ({ id: i + 1, name: d.name, included: true }));
    _renderAfPresets();
  }
}

let _tagPanelAbortCtrl = null;

function _openTagPanel(prefix = 'lm') {
  const trigger = document.getElementById(`${prefix}-tag-trigger`);
  const panel   = document.getElementById(`${prefix}-tag-panel`);
  if (!panel || !trigger) return;

  _tagPanelAbortCtrl?.abort();
  _tagPanelAbortCtrl = new AbortController();
  const { signal } = _tagPanelAbortCtrl;

  // Move to body so position:fixed is relative to the viewport, not a transformed ancestor
  if (panel.parentNode !== document.body) document.body.appendChild(panel);

  positionPanel(trigger, panel);
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');

  // Reposition (and close on resize), but ignore scrolls that originate inside the panel itself
  window.addEventListener('resize', () => _closeTagPanel(prefix), { signal });
  document.addEventListener('scroll', e => {
    if (panel.contains(e.target)) return;
    _closeTagPanel(prefix);
  }, { capture: true, signal });
}

function _closeTagPanel(prefix = 'lm') {
  const trigger = document.getElementById(`${prefix}-tag-trigger`);
  const panel   = document.getElementById(`${prefix}-tag-panel`);
  if (!panel) return;
  panel.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  _tagPanelAbortCtrl?.abort();
  _tagPanelAbortCtrl = null;
}

function _resetNewTagColorPicker(prefix = 'lm') {
  _newTagColor = _TAG_COLORS[0];
  document.querySelectorAll(`#${prefix}-tag-new-colors .lm-tag-color-dot`).forEach((b, i) => {
    b.classList.toggle('selected', i === 0);
  });
}

async function _doSaveNewTag(prefix = 'lm') {
  const nameInput = document.getElementById(`${prefix}-tag-new-name`);
  const saveBtn   = document.getElementById(`${prefix}-tag-new-save`);
  const newForm   = document.getElementById(`${prefix}-tag-new-form`);
  const name      = nameInput?.value.trim();
  if (!name) { nameInput?.focus(); return; }

  const { currentUser } = (_getCtx != null ? _getCtx() : {});
  if (!currentUser) { window.showToast?.('로그인이 필요합니다.', 'error'); return; }
  if (_topicTags.some(t => t.name === name)) { window.showToast?.('이미 존재하는 카테고리입니다.', 'warn'); return; }
  if (_topicTags.length >= 20) { window.showToast?.('카테고리는 최대 20개까지 가능합니다.', 'warn'); return; }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중…'; }

  try {
    const newId  = _topicTags.length > 0 ? Math.max(..._topicTags.map(t => t.id)) + 1 : 1;
    const newTag = { id: newId, name, color: _newTagColor };

    await setDoc(doc(db, 'users', currentUser.uid), { topicTags: [..._topicTags, newTag] }, { merge: true });

    _topicTags.push(newTag);

    _refreshTagPicker(newId, prefix);

    if (newForm)   newForm.hidden = true;
    if (nameInput) nameInput.value = '';
    _resetNewTagColorPicker(prefix);
    window.showToast?.(`카테고리 "${name}"이 추가되었습니다.`, 'success');
  } catch (err) {
    console.error('[강비서] 카테고리 저장 오류:', err);
    window.showToast?.('카테고리 저장에 실패했습니다.', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
  }
}

function _bindTagPickerEvents(prefix = 'lm') {
  const trigger   = document.getElementById(`${prefix}-tag-trigger`);
  const panel     = document.getElementById(`${prefix}-tag-panel`);
  const newBtn    = document.getElementById(`${prefix}-tag-new-btn`);
  const newForm   = document.getElementById(`${prefix}-tag-new-form`);
  const cancelBtn = document.getElementById(`${prefix}-tag-new-cancel`);
  const nameInput = document.getElementById(`${prefix}-tag-new-name`);
  const colorsDiv = document.getElementById(`${prefix}-tag-new-colors`);
  if (!trigger || !panel) return;

  // Build color preset buttons once
  if (colorsDiv && !colorsDiv.dataset.built) {
    colorsDiv.innerHTML = _TAG_COLORS.map((c, i) =>
      `<button type="button" class="lm-tag-color-dot${i === 0 ? ' selected' : ''}"
               data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');
    colorsDiv.dataset.built = '1';
    colorsDiv.addEventListener('click', e => {
      const btn = e.target.closest('.lm-tag-color-dot');
      if (!btn) return;
      colorsDiv.querySelectorAll('.lm-tag-color-dot').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _newTagColor = btn.dataset.color;
    });
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden ? _openTagPanel(prefix) : _closeTagPanel(prefix);
  });

  document.getElementById(`${prefix}-tag-option-list`)?.addEventListener('click', e => {
    const opt = e.target.closest('.lm-tag-option');
    if (!opt) return;
    const raw   = opt.dataset.tagId;
    const tagId = raw === '' ? null : Number(raw);
    _applyTagTrigger(tagId, prefix);
    _closeTagPanel(prefix);
  });

  newBtn?.addEventListener('click', () => {
    if (!newForm) return;
    newForm.hidden = !newForm.hidden;
    if (!newForm.hidden) nameInput?.focus();
  });

  cancelBtn?.addEventListener('click', () => {
    if (newForm)   newForm.hidden = true;
    if (nameInput) nameInput.value = '';
    _resetNewTagColorPicker(prefix);
  });

  nameInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); _doSaveNewTag(prefix); }
    if (e.key === 'Escape') { e.stopPropagation(); cancelBtn?.click(); }
  });

  document.getElementById(`${prefix}-tag-new-save`)?.addEventListener('click', () => _doSaveNewTag(prefix));

  // Close on outside click
  document.addEventListener('click', () => { if (panel && !panel.hidden) _closeTagPanel(prefix); });
  panel.addEventListener('click', e => e.stopPropagation());
}

/* ════════════════════════════════════════
   공통 저장 로직
════════════════════════════════════════ */
async function _doSave(payload, currentUser, submitBtn) {
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '저장 중...'; }
  const { allLectures } = _getCtx();
  try {
    if (_editingLecId) {
      await updateDoc(doc(db, 'lectures', _editingLecId), payload);
      window.showToast?.('강의가 수정되었습니다.', 'success');
      const idx = allLectures.findIndex(l => l.id === _editingLecId);
      if (idx >= 0) {
        allLectures[idx] = { ...allLectures[idx], ...payload };
        if (allLectures[idx]._status !== undefined)
          allLectures[idx]._status = _classifyFn(allLectures[idx]);
        _activeModalId = _editingLecId;
        _editingLecId  = null;
        _populateView(allLectures[idx]);
        _switchMode('view');
      } else {
        _closeModal();
      }
    } else {
      if (!currentUser) return;
      const docRef = await addDoc(collection(db, 'lectures'), {
        uid: currentUser.uid, ...payload, isDocumented: false, createdAt: serverTimestamp(),
      });
      // Flush pending todos that were staged before the lecture existed
      if (_pendingTodos.length > 0) {
        await Promise.all(_pendingTodos.map(t => addTodo(currentUser.uid, t.text, docRef.id)));
        _pendingTodos = [];
      }
      window.showToast?.('강의가 등록되었습니다.', 'success');
      _closeModal();
      if (!window._icsImportChecked) {
        window._icsImportChecked = true;
        _checkIcsImport(currentUser);
      }
    }
  } catch (err) {
    console.error('[강비서] 강의 저장 오류:', err);
    window.showToast?.('저장에 실패했습니다.', 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '저장하기'; }
  }
}

async function _checkIcsImport(user) {
  const raw = localStorage.getItem('temp_lectures');
  if (!raw || !user) return;

  const importedData = JSON.parse(raw);
  console.log('[강비서] 임시 데이터 발견, 저장 시작:', importedData.length);

  try {
    for (const data of importedData) {
      await addDoc(collection(db, 'lectures'), {
        uid: user.uid,
        ...data,
        isDocumented: false,
        createdAt: serverTimestamp(),
      });
    }
    localStorage.removeItem('temp_lectures');
    window.showToast?.(`${importedData.length}건의 강의가 등록되었습니다.`, 'success');
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    console.error('[강비서] 연동 실패:', err);
  }
}

/* ════════════════════════════════════════
   리뷰 모달 — 유틸
════════════════════════════════════════ */
function _lecField(l, which) {
  return which === 's'
    ? (l.startTime != null ? l.startTime : (l.timeStart != null ? l.timeStart : ''))
    : (l.endTime   != null ? l.endTime   : (l.timeEnd   != null ? l.timeEnd   : ''));
}

function _findConflictLec(rawNewLec, sameDayRaw, check) {
  if (!sameDayRaw.length) return null;
  const nS = timeToMin(rawNewLec.startTime);
  const nE = timeToMin(rawNewLec.endTime);

  if (check.step === 1) {
    return sameDayRaw.find(l => {
      const s = timeToMin(_lecField(l,'s')), e = timeToMin(_lecField(l,'e'));
      return Math.max(nS, s) < Math.min(nE, e);
    }) || sameDayRaw[0];
  }

  return sameDayRaw.reduce((best, l) => {
    const s  = timeToMin(_lecField(l,'s')),    e  = timeToMin(_lecField(l,'e'));
    const bs = timeToMin(_lecField(best,'s')), be = timeToMin(_lecField(best,'e'));
    const dist     = nS >= e  ? nS - e  : s  - nE;
    const bestDist = nS >= be ? nS - be : bs - nE;
    return Math.abs(dist) < Math.abs(bestDist) ? l : best;
  }, sameDayRaw[0]);
}


/* ════════════════════════════════════════
   리뷰 모달 — open / close
════════════════════════════════════════ */
function _openReviewModal(check, rawNewLec, conflictLec, payload, currentUser) {
  const bd = document.getElementById('lm-rv-backdrop');
  if (!bd) return;

  const nS        = timeToMin(rawNewLec.startTime);
  const cS        = timeToMin(_lecField(conflictLec, 's'));
  const isNewFirst = nS <= cS;

  const prevIsNew  = isNewFirst;
  const prevStart  = prevIsNew ? rawNewLec.startTime          : _lecField(conflictLec, 's');
  const prevEnd    = prevIsNew ? rawNewLec.endTime            : _lecField(conflictLec, 'e');
  const prevTitle  = prevIsNew ? payload.title                : (conflictLec.title  || '(제목 없음)');
  const prevClient = prevIsNew ? payload.client               : (conflictLec.client || '—');
  const prevPlace  = prevIsNew ? (rawNewLec.place  || '—')   : (conflictLec.place  || '—');
  const prevStatus = prevIsNew ? null : (conflictLec.progressStatus != null ? conflictLec.progressStatus : (conflictLec._status != null ? conflictLec._status : null));
  const nextStart  = prevIsNew ? _lecField(conflictLec, 's')  : rawNewLec.startTime;
  const nextEnd    = prevIsNew ? _lecField(conflictLec, 'e')  : rawNewLec.endTime;
  const nextTitle  = prevIsNew ? (conflictLec.title  || '(제목 없음)') : payload.title;
  const nextClient = prevIsNew ? (conflictLec.client || '—')            : payload.client;
  const nextPlace  = prevIsNew ? (conflictLec.place  || '—') : (rawNewLec.place    || '—');
  const nextStatus = prevIsNew ? (conflictLec.progressStatus != null ? conflictLec.progressStatus : (conflictLec._status != null ? conflictLec._status : null)) : null;

  const isHard        = !!check.isHardConflict;
  const isOnlineCtx   = (rawNewLec.isOnline != null ? rawNewLec.isOnline : false) || (conflictLec != null && conflictLec.isOnline != null ? conflictLec.isOnline : false);
  const wrapup  = prevIsNew ? (rawNewLec.wrapupTime  != null ? rawNewLec.wrapupTime  : 0) : (conflictLec.wrapupTime != null ? conflictLec.wrapupTime : 0);
  const setup   = prevIsNew ? (conflictLec.setupTime != null ? conflictLec.setupTime : 0) : (rawNewLec.setupTime    != null ? rawNewLec.setupTime    : 0);
  const travel  = (check.travelMin != null ? check.travelMin : 0);
  const reqGap  = wrapup + travel + setup;
  const actGap  = check.pureGap != null
    ? check.pureGap
    : timeToMin(nextStart) - timeToMin(prevEnd);
  const delay   = reqGap - actGap;
  const depStr  = minToTime(timeToMin(prevEnd) + wrapup);

  // ── Alternatives ────────────────────────────────────
  const _alts    = (check.alternatives != null ? check.alternatives : {});
  const _optA    = (_alts.optionA != null ? _alts.optionA : []);
  const _optB    = (_alts.optionB != null ? _alts.optionB : []);
  const _optC    = (_alts.optionC != null ? _alts.optionC : null);
  const _hasAlts = _optA.length > 0 || _optB.length > 0 || _optC != null;

  const _mkAltBtn = slot => {
    const { main, day } = formatDateKo(slot.date);
    return `<button class="lm-rv-alt-btn"
      data-opt-date="${escapeHtml(slot.date)}"
      data-opt-start="${escapeHtml(slot.startTime)}"
      data-opt-end="${escapeHtml(slot.endTime)}">
      <span>${escapeHtml(slot.startTime)} ~ ${escapeHtml(slot.endTime)}</span>
      <span class="lm-rv-alt-btn-date">${main} (${day}) →</span>
    </button>`;
  };

  const altsHtml = (_hasAlts && delay > 0) ? `
    <div class="lm-rv-alts" id="lm-rv-alts">
      <p class="lm-rv-alts-title">💡 대안 일정 제안</p>
      ${_optA.length > 0 ? `<div class="lm-rv-alt-group"><p class="lm-rv-alt-group-label">📅 같은 날 · 다른 시간대</p>${_optA.map(_mkAltBtn).join('')}</div>` : ''}
      ${_optB.length > 0 ? `<div class="lm-rv-alt-group"><p class="lm-rv-alt-group-label">📆 인접 날짜 · 같은 시간대</p>${_optB.map(_mkAltBtn).join('')}</div>` : ''}
      ${_optC ? `<div class="lm-rv-alt-group"><p class="lm-rv-alt-group-label">🗓 다음 주 · 같은 요일</p>${_mkAltBtn(_optC)}</div>` : ''}
    </div>` : '';

  const stepLabel = check.step === 1
    ? '시간이 직접 겹칩니다'
    : check.step === 2
    ? '이동 버퍼 시간이 부족합니다'
    : check.isFallback
    ? '이동 시간 포함 시 도착이 늦습니다 (직선거리 추정)'
    : '이동 시간 포함 시 도착이 늦습니다';

    const _roleMap = { discussing: '논의 중인 강의', onhold: '보류 중인 강의', cancelled: '취소된 강의', needs_review: '검토 필요 강의' };
    const mkCard = (isNew, start, end, title, client, place, status) =>
    `<div class="lm-rv-card ${isNew ? 'lm-rv-card--new' : 'lm-rv-card--ext'}">
      <p class="lm-rv-role">${isNew ? '입력 중인 새 강의' : (_roleMap[status] || '기존 확정 강의')}</p>
      <p class="lm-rv-time">${escapeHtml(start)} ~ ${escapeHtml(end)}</p>
      <p class="lm-rv-lec-title">${escapeHtml(title)}</p>
      <p class="lm-rv-client">🏢 ${escapeHtml(client)}</p>
      <p class="lm-rv-place">📍 ${escapeHtml(place)}</p>
    </div>`;

  bd.innerHTML = `
    <div class="lm-rv-modal">
      <div class="lm-rv-head${(!isHard && delay <= 0) ? ' lm-rv-head--ok' : ''}">
        <div>
          <h2>${(!isHard && delay <= 0) ? '✅ 일정 여유 확인됨' : '⚠️ 일정 충돌 검토'}</h2>
          <p class="lm-rv-head-sub">${(!isHard && delay <= 0) ? '이동 시간을 포함해도 여유가 있습니다' : escapeHtml(stepLabel)}</p>
        </div>
        <button class="lm-rv-x" id="lm-rv-x" aria-label="닫기">✕</button>
      </div>

      <div class="lm-rv-body">
        <div class="lm-rv-vs">
          ${mkCard(prevIsNew,  prevStart, prevEnd, prevTitle, prevClient, prevPlace, prevStatus)}
          <div class="lm-rv-vs-badge">VS</div>
          ${mkCard(!prevIsNew, nextStart, nextEnd, nextTitle, nextClient, nextPlace, nextStatus)}
        </div>

        ${isHard
          ? `<div class="lm-rv-hard-warn">
              <p class="lm-rv-hard-warn-title">⛔ TimeOverlapUU</p>
              <p class="lm-rv-hard-warn-sub">${escapeHtml(stepLabel)}</p>
            </div>`
          : `<div class="lm-rv-breakdown">
          <p class="lm-rv-bd-title">🚨 지연 분석</p>
          <div class="lm-rv-row">
            <span>🚗 출발 예정 시각 (자차)</span>
            <span class="v">${escapeHtml(depStr)}</span>
          </div>
          <div class="lm-rv-row">
            <span>🧹 강의 정리 시간</span>
            <span class="v">${wrapup}분</span>
          </div>
          <div class="lm-rv-row">
            <span>🚚 예상 이동 시간${isOnlineCtx ? '' : (check.isFallback ? ' (직선 추정 ⚠️)' : ' (카카오)')}</span>
            <span class="v">${isOnlineCtx ? '💻 온라인 (이동 없음)' : `${travel}분`}</span>
          </div>
          <div class="lm-rv-row">
            <span>⚙️ 강의 세팅 시간</span>
            <span class="v">${setup}분</span>
          </div>
          <div class="lm-rv-gap lm-rv-gap--req">
            <span>📋 필요 여유 시간</span>
            <span class="v">${reqGap}분 필요</span>
          </div>
          <div class="lm-rv-gap lm-rv-gap--act">
            <span>⏳ 실제 확보된 여유</span>
            <span class="v">${actGap}분 확보</span>
          </div>
          <div class="lm-rv-delay${delay <= 0 ? ' lm-rv-delay--ok' : ''}">
            <span class="lm-rv-delay-label${delay <= 0 ? ' lm-rv-delay-label--ok' : ''}">${delay <= 0 ? '✅ 여유 충분' : '🚩 최종 지연 예상'}</span>
            <span class="lm-rv-delay-value${delay <= 0 ? ' lm-rv-delay-value--ok' : ''}">${delay > 0 ? `${delay}분 부족` : 'OK'}</span>
          </div>
        </div>`
        }
        ${altsHtml}
      </div>

      <div class="lm-rv-foot">
        ${(isHard || delay > 0)
          ? `<button class="lm-rv-btn lm-rv-btn--back" id="lm-rv-back">← 수정하기</button>
             <button class="lm-rv-btn lm-rv-btn--pending" id="lm-rv-pending">보류로 저장</button>
             <button class="lm-rv-btn lm-rv-btn--force" id="lm-rv-force">그대로 저장하기</button>`
          : `<button class="lm-rv-btn lm-rv-btn--confirm" id="lm-rv-confirm">확인 후 등록</button>`
        }
      </div>
    </div>`;

  requestAnimationFrame(() => bd.classList.add('open'));
  document.body.style.overflow = 'hidden';

  document.getElementById('lm-rv-x').addEventListener('click', _closeReviewModal);
  bd.addEventListener('click', e => { if (e.target === bd) _closeReviewModal(); });

  if (isHard || delay > 0) {
    document.getElementById('lm-rv-back').addEventListener('click', _closeReviewModal);
    document.getElementById('lm-rv-pending').addEventListener('click', async () => {
      const btn = document.getElementById('lm-rv-pending');
      btn.disabled    = true;
      btn.textContent = '저장 중...';
      await _doSave({ ...payload, progressStatus: 'discussing' }, currentUser, null);
      _closeReviewModal();
      _closeModal();
    });
    document.getElementById('lm-rv-force').addEventListener('click', async () => {
      const btn = document.getElementById('lm-rv-force');
      btn.disabled    = true;
      btn.textContent = '저장 중...';
      await _doSave(payload, currentUser, null);
      _closeReviewModal();
      _closeModal();
    });
  } else {
    document.getElementById('lm-rv-confirm').addEventListener('click', async () => {
      const btn = document.getElementById('lm-rv-confirm');
      btn.disabled    = true;
      btn.textContent = '저장 중...';
      await _doSave(payload, currentUser, null);
      _closeReviewModal();
      _closeModal();
    });
  }

  // ── Alternative slot selection ───────────────────────
  bd.querySelector('#lm-rv-alts')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-opt-date]');
    if (!btn) return;
    _applyAlternative({
      date:      btn.dataset.optDate,
      startTime: btn.dataset.optStart,
      endTime:   btn.dataset.optEnd,
    });
  });
}

function _closeReviewModal() {
  const bd = document.getElementById('lm-rv-backdrop');
  if (!bd) return;
  bd.classList.remove('open');
  setTimeout(() => { bd.innerHTML = ''; }, 200);
  document.body.style.overflow = _backdrop()?.classList.contains('open') ? 'hidden' : '';
}

function _applyAlternative(option) {
  _closeReviewModal();
  const dateEl   = document.getElementById('af-date');
  const startSel = document.getElementById('af-time-start');
  if (dateEl)   dateEl.value = option.date;
  if (startSel) { startSel.innerHTML = buildTimeOptions(); startSel.value = option.startTime; }
  syncEndTimeOptions(option.endTime);
  updateDurationDisplay();
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
  void el.offsetWidth; // restart animation
  el.classList.add('date-sync-flash');
}

/* ════════════════════════════════════════
   예상 지급일 자동 계산
════════════════════════════════════════ */
function _autoFillPaymentDate(forceOverwrite = false) {
  const cycleEl = document.getElementById('af-settlement-cycle');
  const payEl   = document.getElementById('af-payment-date');
  if (!cycleEl || !payEl) return;

  const cycle = cycleEl.value;
  if (!cycle) return;
  if (!forceOverwrite && payEl.value) return;  // manual entry → skip unless cycle changed

  const date    = document.getElementById('af-date')?.value;
  const endDate = document.getElementById('af-end-date')?.value;
  if (!date) return;

  let lastDate = null;
  if (cycle === 'after-completion') {
    const ctx     = _getCtx?.();
    const groupId = _editingLecId
      ? ctx?.allLectures?.find(l => l.id === _editingLecId)?.groupId
      : null;
    if (groupId && ctx?.allLectures) {
      lastDate = ctx.allLectures
        .filter(l => l.groupId === groupId)
        .reduce((max, l) => { const d = l.endDate || l.date || ''; return d > max ? d : max; }, '');
    }
    lastDate = lastDate || endDate || date;
  }

  const baseDate = cycle === 'after-completion' ? (lastDate || date) : (endDate || date);
  payEl.value = calcPaymentDate(baseDate, cycle, lastDate);
}

/* ════════════════════════════════════════
   이벤트 바인딩
════════════════════════════════════════ */
function _bindEvents() {
  document.getElementById('modal-close-btn')?.addEventListener('click', _closeModal);

  _backdrop()?.addEventListener('click', e => {
    if (e.target !== _backdrop()) return;
    const formPanel   = document.getElementById('form-panel');
    const isFormOpen  = formPanel && formPanel.style.display !== 'none';
    if (isFormOpen) {
      const dirty = ['af-title','af-client','af-fee','af-topic','af-place','af-classroom','af-memo','af-group-info']
        .some(id => (document.getElementById(id)?.value || '').trim() !== '')
        || _afSupplies.length > 0
        || _afPresets.some(p => !p.included);
      if (dirty && !confirm('작성 중인 내용이 사라집니다. 계속 닫으시겠어요?')) return;
    }
    _closeModal();
  });

  document.getElementById('btn-add-lecture')?.addEventListener('click', openAddModal);

  document.getElementById('btn-modal-edit')?.addEventListener('click', () => {
    if (!_activeModalId) return;
    const { allLectures } = _getCtx();
    const lec = allLectures.find(l => l.id === _activeModalId);
    if (!lec) return;
    _editingLecId = _activeModalId;
    document.getElementById('modal-title').textContent = '강의 수정';
    const sub = document.getElementById('modal-form-subtitle');
    if (sub) sub.textContent = '강의 정보를 수정하세요.';
    _populateForm(lec);
    _switchMode('form');
    document.getElementById('af-title')?.focus();
  });

  document.getElementById('af-online')?.addEventListener('change', e => {
    const placeEl  = document.getElementById('af-place');
    const required = document.getElementById('af-place-required');
    const addrBtn  = document.getElementById('v-addr-search');
    if (!placeEl) return;
    if (e.target.checked) {
      placeEl.disabled    = true;
      placeEl.value       = '';
      placeEl.placeholder = '';
      if (required) required.style.display = 'none';
      if (addrBtn)  addrBtn.disabled = true;
    } else {
      placeEl.disabled    = false;
      placeEl.value       = '';
      placeEl.placeholder = '예) 서울 강남구 SSDC 4F';
      if (required) required.style.display = '';
      if (addrBtn)  addrBtn.disabled = false;
    }
  });

  document.getElementById('af-paid-status')?.addEventListener('change', e => {
    const taxSel = document.getElementById('af-tax');
    if (!taxSel) return;
    if (e.target.value === 'na') {
      taxSel.value    = 'na';
      taxSel.disabled = true;
    } else {
      taxSel.disabled = false;
    }
  });

  document.getElementById('af-fee')?.addEventListener('input', _syncFeeTotalForm);
  document.getElementById('af-session-total')?.addEventListener('input', _syncFeeTotalForm);

  document.getElementById('af-settlement-cycle')?.addEventListener('change', () => {
    _autoFillPaymentDate(true);  // cycle change always overwrites
  });

  document.getElementById('af-date')?.addEventListener('change', () => {
    const startEl = document.getElementById('af-date');
    const endEl   = document.getElementById('af-end-date');
    if (!startEl || !endEl) return;
    endEl.value = startEl.value;
    _flashHighlight(endEl);
    syncEndTimeOptions('', false); // reset to same-day end-time options
    updateDurationDisplay();
    _autoFillPaymentDate(false);  // date change: only fill when payment date is empty
  });

  document.getElementById('v-addr-search')?.addEventListener('click', () => openKakaoAddress('af-place'));

  document.getElementById('btn-form-cancel')?.addEventListener('click', () => {
    if (_editingLecId) {
      const id = _activeModalId;
      _editingLecId = null;
      const { allLectures } = _getCtx();
      const lec = allLectures.find(l => l.id === id);
      if (lec) { _populateView(lec); _switchMode('view'); }
      else _closeModal();
    } else {
      _closeModal();
    }
  });

  document.getElementById('btn-form-submit')?.addEventListener('click', async () => {
    const get       = function(id) { var _e = document.getElementById(id); return (_e != null && _e.value != null ? _e.value.trim() : ''); };
    const date      = get('af-date');
    const timeStart = get('af-time-start');
    const timeEnd   = get('af-time-end');
    const title     = get('af-title');
    const client    = get('af-client');
    var _afOnline = document.getElementById('af-online'); const isOnline  = (_afOnline != null ? _afOnline.checked : false);
    const place     = isOnline ? 'Online' : get('af-place');
    const feeRaw    = get('af-fee');
    const endDate   = get('af-end-date') || date;
    const isOvernight = endDate !== date;

    if (!date || !timeStart || !timeEnd || !title || !client || (!isOnline && !place)) {
      window.showToast?.('날짜, 시간, 강의명, 고객사, 강의장소는 필수 입력 항목이에요.', 'error');
      return;
    }
    if (!isOvernight && timeEnd <= timeStart) {
      window.showToast?.('종료 시간은 시작 시간보다 이후여야 합니다.', 'error');
      return;
    }

    if (!isOnline) {
      const coords = await _geocode(place);
      if (!coords) {
        window.showToast?.('주소 오류: 카카오맵에서 찾을 수 없는 주소입니다.', 'error');
        return;
      }
    }

    const { allLectures, currentUser } = _getCtx();
    var _devRaw1 = localStorage.getItem('kangbiseo_device');
    var _devData1 = JSON.parse(_devRaw1 != null ? _devRaw1 : 'null');
    const rawSched = (_devData1 != null && _devData1.scheduler != null ? _devData1.scheduler : {});
    const settings = {
      bufferTime:  rawSched.bufferTime === 'custom' ? (Number(rawSched.bufferCustom) || 30) : (Number(rawSched.bufferTime) || 30),
      setupTime:   Number(rawSched.setupTime)  || 20,
      wrapupTime:  Number(rawSched.wrapupTime) || 15,
      transport:   rawSched.transport          || 'car',
      originAddr:  resolveOriginAddr(date),
    };

    var _afFullDay = document.getElementById('af-full-day');
    const isFullDay = _afFullDay != null ? _afFullDay.checked : false;
    const newLec = {
      date,
      startTime:  timeStart,
      endTime:    timeEnd,
      place,
      isOnline,
      isFullDay,
      setupTime:  Number(get('af-setup-time'))  || 0,
      wrapupTime: Number(get('af-wrapup-time')) || 0,
    };

    const sameDayRaw   = allLectures.filter(l => l.date === date && l.id !== _editingLecId);
    const existingLecs = sameDayRaw.map(l => ({
      date:       l.date,
      startTime:  (l.startTime != null ? l.startTime : (l.timeStart != null ? l.timeStart : '')),
      endTime:    (l.endTime   != null ? l.endTime   : (l.timeEnd   != null ? l.timeEnd   : '')),
      place:      l.isOnline ? 'Online' : (l.place != null ? l.place : ''),
      isOnline:   (l.isOnline  != null ? l.isOnline  : false),
      setupTime:  (l.setupTime != null ? l.setupTime : 0),
      wrapupTime: (l.wrapupTime != null ? l.wrapupTime : 0),
    }));

    var _afPaidEl = document.getElementById('af-paid-status'); const _paidStatusVal = (_afPaidEl != null && _afPaidEl.value != null ? _afPaidEl.value : 'false');
    const isPaid         = _paidStatusVal === 'true';
    const paidStatus     = _paidStatusVal;
    const taxType        = document.getElementById('af-tax')?.value || 'income3_3';

    const _includedPresets = _afPresets.filter(p => p.included).map((p, i) => ({ id: i + 1, name: p.name, isChecked: false }));
    const _mergedSupplies  = [
      ..._includedPresets,
      ..._afSupplies.map((s, j) => ({ id: _includedPresets.length + j + 1, name: s.name, isChecked: false })),
    ];

    const payload = {
      startDate: date, startTime: timeStart, endDate, endTime: timeEnd,
      date, timeStart, timeEnd, title, client,
      fee:            Number(feeRaw),
      feeAmount:      Number(document.getElementById('af-fee-total')?.value) || null,
      sessionCurrent: Number(get('af-session-current')) || null,
      sessionTotal:   Number(get('af-session-total'))   || null,
      participants:   Number(get('af-participants'))     || null,
      groupInfo:      get('af-group-info'),
      topic:          get('af-topic'),
      topicTagId:     get('af-topic-tag') ? Number(get('af-topic-tag')) : null,
      setupTime:      Number(get('af-setup-time'))  || 0,
      wrapupTime:     Number(get('af-wrapup-time')) || 0,
      supplies:       _mergedSupplies,
      place,
      isOnline,
      isFullDay,
      classroom:      get('af-classroom'),
      parkingInfo:    get('af-parking'),
      managerName:    get('af-manager-name'),
      managerPhone:   get('af-manager-phone'),
      managerEmail:   get('af-manager-email'),
      progressStatus: get('af-progress') || 'scheduled',
      isPaid, paidStatus, paymentDate: get('af-payment-date'),
      settlementCycle: get('af-settlement-cycle') || null,
      taxType,
      isOvernight, endDate,
      memo:           get('af-memo'),
    };

    let check;
    try {
      check = await checkScheduleConflict(newLec, existingLecs, settings, allLectures);
    } catch (err) {
      console.error('[강비서] 충돌 검사 오류:', err);
      window.showToast?.('일정 충돌 검사 중 오류가 발생했습니다.', 'error');
      return;
    }
    console.log('[강비서] Check Result:', check);

    if (check.status === 'risk') {
      const conflictLec = _findConflictLec(newLec, sameDayRaw, check);
      _openReviewModal(check, newLec, conflictLec, payload, currentUser);
      return;
    }
    if (check.status === 'warning') {
      const toast = formatConflictWarning(check);
      if (toast) window.showToast?.(toast.message, toast.type);
    }

    // Quick-save supplies as topic default if requested
    const _topicTagRaw = get('af-topic-tag');
    const _quickSaveCb = document.getElementById('af-supplies-save-default');
    if (_quickSaveCb?.checked && _topicTagRaw) {
      _saveTopicDefaultSupplies(Number(_topicTagRaw), _mergedSupplies);
      window.showToast?.('준비물 기본값이 저장되었습니다.', 'success');
    }

    const submitBtn = document.getElementById('btn-form-submit');
    await _doSave(payload, currentUser, submitBtn);
  });

  document.getElementById('btn-modal-delete')?.addEventListener('click', () => {
    _confirmBd()?.classList.add('open');
  });

  document.getElementById('btn-confirm-cancel')?.addEventListener('click', _closeConfirm);

  _confirmBd()?.addEventListener('click', e => {
    if (e.target === _confirmBd()) _closeConfirm();
  });

  document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
    if (!_activeModalId) return;
    const id = _activeModalId;
    _closeConfirm();
    _closeModal();
    try {
      await deleteDoc(doc(db, 'lectures', id));
      window.showToast?.('강의가 삭제되었습니다.', 'error');
    } catch (err) {
      console.error('[강비서] 강의 삭제 오류:', err);
      window.showToast?.('삭제에 실패했습니다.', 'error');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const tagPanel = document.getElementById('lm-tag-panel');
    if (tagPanel && !tagPanel.hidden) { _closeTagPanel(); return; }
    if (document.getElementById('lm-rv-backdrop')?.classList.contains('open')) {
      _closeReviewModal();
    } else {
      _closeModal();
      _closeConfirm();
    }
  });

  _bindTagPickerEvents();

  // ── 준비물 칩 입력 ──────────────────────────────────────────────────
  document.getElementById('af-supplies-wrap')?.addEventListener('click', e => {
    const removeBtn = e.target.closest('.supplies-chip-remove');
    if (removeBtn) {
      const idStr  = removeBtn.dataset.id;
      _afSupplies  = _afSupplies.filter(s => String(s.id) !== idStr);
      _renderAfChips();
      return;
    }
    document.getElementById('af-supplies-input')?.focus();
  });
  document.getElementById('af-supplies-input')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = e.target.value.trim();
    if (!name) return;
    _afSupplies.push({ id: Date.now(), name, isChecked: false });
    _renderAfChips();
    e.target.value = '';
  });

  document.getElementById('af-supplies-presets-list')?.addEventListener('change', e => {
    const cb = e.target.closest('.supplies-preset-cb');
    if (!cb) return;
    const presetId = Number(cb.dataset.presetId);
    const preset = _afPresets.find(p => p.id === presetId);
    if (preset) {
      preset.included = cb.checked;
      cb.closest('.supplies-preset-item')?.classList.toggle('is-checked', cb.checked);
    }
  });

  // ── 모달 뷰 패널: 기존 강의 할 일 추가 (Firestore 직접) ─────────────
  document.getElementById('v-todo-add-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('v-todo-input');
    const text  = input?.value.trim();
    if (!text || !_activeModalId) return;
    const { currentUser, allLectures } = (_getCtx != null ? _getCtx() : {});
    if (!currentUser) return;
    try {
      const lec       = allLectures != null ? allLectures.find(l => l.id === _activeModalId) : null;
      const gId       = (lec != null && lec.groupId != null ? lec.groupId : null);
      const dueDateEl = document.getElementById('v-todo-due-date');
      const dueDate   = dueDateEl?.value || null;
      await addTodo(currentUser.uid, text, gId ? null : _activeModalId, gId, dueDate);
      input.value = '';
      if (dueDateEl) dueDateEl.value = '';
    } catch (err) { console.error('[강비서] 모달 Todo 추가 오류:', err); }
  });

  document.getElementById('v-todo-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('v-todo-add-btn')?.click(); }
  });

  // ── 폼 패널: 신규 강의 pending 할 일 추가 (로컬 배열) ───────────────
  document.getElementById('af-todo-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('af-todo-input');
    const text  = input?.value.trim();
    if (!text) return;
    _pendingTodos = [
      ..._pendingTodos,
      { id: `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, text, isDone: false, postponeCount: 0, deadline: document.getElementById('af-todo-due-date')?.value || getTodayString(), lectureId: null },
    ];
    _refreshPendingUI?.();
    input.value = '';
    const afDueDateEl = document.getElementById('af-todo-due-date');
    if (afDueDateEl) afDueDateEl.value = '';
  });

  document.getElementById('af-todo-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('af-todo-add-btn')?.click(); }
  });
}
