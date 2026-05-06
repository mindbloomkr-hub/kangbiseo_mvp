// js/components/lectureModal.js — 강의 모달 공통 모듈 (상세보기 + CRUD)

// 1. 모든 import 문 (파일 최상단에 모아두세요)
import { db } from '../api.js';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  doc, 
  addDoc, 
  updateDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  TAX_LABEL, PROGRESS_LABEL, STATUS_META,
  escapeHtml, formatDateKo, calcDuration, classifyStatus,
  buildTimeOptions, updateDurationDisplay, syncEndTimeOptions, initTimeSelects,
  checkScheduleConflict, _geocode,
} from '../utils.js';

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
let _activeModalId = null;
let _editingLecId  = null;
let _getCtx        = null;
let _classifyFn    = classifyStatus;
let _statusMeta    = STATUS_META;

/* ════════════════════════════════════════
   초기화
════════════════════════════════════════ */
export function initLectureModal(getCtx, opts = {}) {
  _getCtx     = getCtx;
  if (opts.classifyStatus) _classifyFn = opts.classifyStatus;
  if (opts.statusMeta)     _statusMeta = opts.statusMeta;
  initTimeSelects();
  _injectReviewStyles();
  _bindEvents();
}

/* ════════════════════════════════════════
   공개 API
════════════════════════════════════════ */
export function openModal(id) {
  const { allLectures } = _getCtx();
  const lec = allLectures.find(l => l.id === id);
  if (!lec || !_backdrop()) return;
  _activeModalId = id;
  _editingLecId  = null;
  _populateView(lec);
  _switchMode('view');
  _backdrop().classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close-btn')?.focus();
}

export function openAddModal() {
  if (!_backdrop()) return;
  _activeModalId = null;
  _editingLecId  = null;

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

  const sched    = JSON.parse(localStorage.getItem('kangbiseo_device') ?? 'null')?.scheduler ?? {};
  const setupEl  = document.getElementById('af-setup-time');
  const wrapupEl = document.getElementById('af-wrapup-time');
  if (setupEl)  setupEl.value  = sched.setupTime  ?? 20;
  if (wrapupEl) wrapupEl.value = sched.wrapupTime ?? 15;

  const placeEl = document.getElementById('af-place');
  if (placeEl) { placeEl.disabled = false; placeEl.placeholder = '예) 서울 강남구 SSDC 4F'; }

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

function _closeModal() {
  _backdrop()?.classList.remove('open');
  document.body.style.overflow = '';
  _activeModalId = null;
  _editingLecId  = null;
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

function _populateView(lec) {
  if (!lec) return;
  const status = _classifyFn(lec);
  const meta   = _statusMeta[status] || { label: status, cls: '' };
  const { full } = formatDateKo(lec.date);

  document.getElementById('modal-title').textContent       = lec.title || '(제목 없음)';
  document.getElementById('modal-badge').className         = `lec-badge ${meta.cls}`;
  document.getElementById('modal-badge').textContent       = meta.label;
  document.getElementById('modal-date-meta').textContent   = `${full} · ${lec.timeStart}~${lec.timeEnd}`;
  document.getElementById('modal-client-meta').textContent = lec.client || '—';

  document.getElementById('v-date').textContent           = full;
  document.getElementById('v-time').textContent           = `${lec.timeStart} ~ ${lec.timeEnd}`;
  document.getElementById('v-total-duration').textContent = calcDuration(lec.timeStart, lec.timeEnd);
  document.getElementById('v-title').textContent          = lec.title  || '—';
  document.getElementById('v-client').textContent         = lec.client || '—';
  document.getElementById('v-fee').textContent            = `₩${(Number(lec.fee)*10000 || 0).toLocaleString()}`;

  document.getElementById('v-session-current').textContent = lec.sessionCurrent ? `${lec.sessionCurrent}회` : '—';
  document.getElementById('v-session-total').textContent   = lec.sessionTotal   ? `${lec.sessionTotal}회`   : '—';
  document.getElementById('v-participants').textContent    = lec.participants    ? `${lec.participants}명`   : '—';
  document.getElementById('v-group-info').textContent      = lec.groupInfo      || '—';
  document.getElementById('v-topic').textContent           = lec.topic          || '—';
  document.getElementById('v-setup-time').textContent      = lec.setupTime  != null ? `${lec.setupTime}분`  : '—';
  document.getElementById('v-wrapup-time').textContent     = lec.wrapupTime != null ? `${lec.wrapupTime}분` : '—';
  document.getElementById('v-supplies').textContent        = lec.supplies       || '—';
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
  paidEl.textContent = lec.isPaid ? '✅ 입금 완료' : '❌ 미입금';
  paidEl.className   = `modal-info-value paid-badge${lec.isPaid ? ' paid-badge--paid' : ' paid-badge--unpaid'}`;
  document.getElementById('v-payment-date').textContent = lec.paymentDate || '미정';
  document.getElementById('v-tax').textContent          = TAX_LABEL[lec.taxType] || '—';

  const memoEl = document.getElementById('v-memo');
  if (lec.memo) { memoEl.textContent = lec.memo; memoEl.classList.remove('is-empty'); }
  else          { memoEl.textContent = '메모 없음'; memoEl.classList.add('is-empty'); }
}

function _populateForm(lec) {
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
  set('af-setup-time',      lec.setupTime  ?? '');
  set('af-wrapup-time',     lec.wrapupTime ?? '');
  set('af-supplies',        lec.supplies);
  const onlineCb = document.getElementById('af-online');
  const placeEl  = document.getElementById('af-place');
  if (onlineCb) onlineCb.checked = lec.isOnline ?? false;
  if (placeEl) {
    placeEl.disabled    = lec.isOnline ?? false;
    placeEl.value       = lec.isOnline ? 'Online' : (lec.place ?? '');
    placeEl.placeholder = lec.isOnline ? '' : '예) 서울 강남구 SSDC 4F';
  }
  set('af-classroom',       lec.classroom);
  set('af-parking',         lec.parkingInfo);
  set('af-manager-name',    lec.managerName);
  set('af-manager-phone',   lec.managerPhone);
  set('af-manager-email',   lec.managerEmail);
  set('af-progress',        lec.progressStatus || 'scheduled');
  set('af-payment-date',    lec.paymentDate);
  set('af-memo',            lec.memo);

  const startSel = document.getElementById('af-time-start');
  if (startSel) { startSel.innerHTML = buildTimeOptions(); startSel.value = lec.timeStart || ''; syncEndTimeOptions(lec.timeEnd || ''); }
  updateDurationDisplay();

  const paidSel = document.getElementById('af-paid-status');
  if (paidSel) paidSel.value = lec.isPaid ? 'true' : 'false';
  const taxSel = document.getElementById('af-tax');
  if (taxSel) taxSel.value = lec.taxType || 'income3_3';
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
      await addDoc(collection(db, 'lectures'), {
        uid: currentUser.uid, ...payload, isDocumented: false, createdAt: serverTimestamp(),
      });
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
function _toMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function _minToStr(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function _lecField(l, which) {
  return which === 's'
    ? (l.startTime ?? l.timeStart ?? '')
    : (l.endTime   ?? l.timeEnd   ?? '');
}

function _findConflictLec(rawNewLec, sameDayRaw, check) {
  if (!sameDayRaw.length) return null;
  const nS = _toMin(rawNewLec.startTime);
  const nE = _toMin(rawNewLec.endTime);

  if (check.step === 1) {
    return sameDayRaw.find(l => {
      const s = _toMin(_lecField(l,'s')), e = _toMin(_lecField(l,'e'));
      return Math.max(nS, s) < Math.min(nE, e);
    }) ?? sameDayRaw[0];
  }

  return sameDayRaw.reduce((best, l) => {
    const s  = _toMin(_lecField(l,'s')),    e  = _toMin(_lecField(l,'e'));
    const bs = _toMin(_lecField(best,'s')), be = _toMin(_lecField(best,'e'));
    const dist     = nS >= e  ? nS - e  : s  - nE;
    const bestDist = nS >= be ? nS - be : bs - nE;
    return Math.abs(dist) < Math.abs(bestDist) ? l : best;
  }, sameDayRaw[0]);
}

/* ════════════════════════════════════════
   리뷰 모달 — CSS 주입 (1회)
════════════════════════════════════════ */
function _injectReviewStyles() {
  if (document.getElementById('lm-rv-styles')) return;
  const s = document.createElement('style');
  s.id = 'lm-rv-styles';
  s.textContent = `
.lm-rv-bd{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .2s}
.lm-rv-bd.open{opacity:1;pointer-events:auto}
.lm-rv-modal{background:#fff;border-radius:20px;width:100%;max-width:520px;max-height:92vh;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.25);display:flex;flex-direction:column}
.lm-rv-head{background:#dc2626;padding:18px 22px;border-radius:20px 20px 0 0;display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0}
.lm-rv-head h2{color:#fff;font-size:17px;font-weight:800;margin:0 0 3px}
.lm-rv-head-sub{color:rgba(255,255,255,.8);font-size:12px;margin:0}
.lm-rv-x{background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;padding:2px 7px;border-radius:6px;line-height:1;flex-shrink:0}
.lm-rv-x:hover{color:#fff;background:rgba(255,255,255,.15)}
.lm-rv-body{padding:18px 20px;overflow-y:auto;flex:1}
.lm-rv-vs{display:grid;grid-template-columns:1fr 34px 1fr;gap:8px;align-items:center;margin-bottom:16px}
.lm-rv-card{border-radius:13px;padding:13px 14px;border:1.5px solid}
.lm-rv-card--new{background:#fef2f2;border-color:#fca5a5}
.lm-rv-card--ext{background:#f8fafc;border-color:#cbd5e1}
.lm-rv-role{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin:0 0 5px}
.lm-rv-card--new .lm-rv-role{color:#dc2626}
.lm-rv-card--ext .lm-rv-role{color:#64748b}
.lm-rv-time{font-size:16px;font-weight:800;margin:0 0 4px;white-space:nowrap}
.lm-rv-card--new .lm-rv-time{color:#dc2626}
.lm-rv-card--ext .lm-rv-time{color:#2563eb}
.lm-rv-lec-title{font-size:12px;font-weight:700;color:#1e293b;margin:0 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-rv-client{font-size:11px;color:#64748b;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-rv-vs-badge{width:34px;height:34px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#dc2626;justify-self:center}
.lm-rv-breakdown{background:#f8fafc;border-radius:13px;padding:14px 16px;border:1px solid #e2e8f0}
.lm-rv-bd-title{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
.lm-rv-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #e2e8f0;font-size:13px;color:#475569}
.lm-rv-row:last-of-type{border-bottom:none}
.lm-rv-row .v{font-weight:700;color:#1e293b}
.lm-rv-gap{display:flex;justify-content:space-between;align-items:center;padding:8px 11px;margin-top:8px;background:#fff;border-radius:9px;border:1px solid;font-size:13px}
.lm-rv-gap--req{border-color:#e2e8f0}
.lm-rv-gap--act{border-color:#bfdbfe;margin-top:4px}
.lm-rv-gap .v{font-weight:700}
.lm-rv-gap--req .v{color:#475569}
.lm-rv-gap--act .v{color:#2563eb}
.lm-rv-delay{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:11px 14px;background:#fef2f2;border-radius:11px;border:1.5px solid #fca5a5}
.lm-rv-delay-label{font-size:13px;font-weight:700;color:#991b1b}
.lm-rv-delay-value{font-size:21px;font-weight:900;color:#dc2626}
.lm-rv-foot{padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;gap:10px;flex-shrink:0}
.lm-rv-btn{flex:1;padding:13px;border-radius:11px;font-size:14px;font-weight:800;border:none;cursor:pointer;transition:background .15s}
.lm-rv-btn:disabled{opacity:.45;cursor:not-allowed}
.lm-rv-btn--back{background:#1e293b;color:#fff}
.lm-rv-btn--back:hover:not(:disabled){background:#0f172a}
.lm-rv-btn--pending{background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa}
.lm-rv-btn--pending:hover:not(:disabled){background:#ffedd5}
.lm-rv-head--ok{background:#16a34a}
.lm-rv-delay--ok{background:#f0fdf4;border-color:#86efac}
.lm-rv-delay-label--ok{color:#166534}
.lm-rv-delay-value--ok{color:#16a34a}
.lm-rv-btn--confirm{background:#16a34a;color:#fff}
.lm-rv-btn--confirm:hover:not(:disabled){background:#15803d}
.lm-rv-btn--force{background:#fff7ed;color:#92400e;border:1.5px solid #fcd34d}
.lm-rv-btn--force:hover:not(:disabled){background:#fef3c7}
.lm-rv-place{font-size:11px;color:#64748b;margin:0; white-space: normal; word-break: keep-all; overflow-wrap: break-word; line-height: 1.4; display: block;}
.lm-rv-hard-warn{background:#fef2f2;border:2px solid #dc2626;border-radius:13px;padding:20px 18px;text-align:center}
.lm-rv-hard-warn-title{font-size:16px;font-weight:900;color:#991b1b;margin:0 0 6px}
.lm-rv-hard-warn-sub{font-size:13px;font-weight:500;color:#dc2626;margin:0}
.lm-rv-alts{margin-top:16px;border-top:1px dashed #e2e8f0;padding-top:14px}
.lm-rv-alts-title{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
.lm-rv-alt-group{margin-bottom:12px}
.lm-rv-alt-group:last-child{margin-bottom:0}
.lm-rv-alt-group-label{font-size:11px;font-weight:700;color:#475569;margin:0 0 6px}
.lm-rv-alt-btn{display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 13px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;font-size:13px;font-weight:600;color:#0369a1;cursor:pointer;margin-bottom:6px;text-align:left;transition:background .15s,border-color .15s}
.lm-rv-alt-btn:last-child{margin-bottom:0}
.lm-rv-alt-btn:hover{background:#e0f2fe;border-color:#7dd3fc}
.lm-rv-alt-btn-date{font-size:11px;color:#64748b;font-weight:400;flex-shrink:0;margin-left:8px;white-space:nowrap}
  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════
   리뷰 모달 — open / close
════════════════════════════════════════ */
function _openReviewModal(check, rawNewLec, conflictLec, payload, currentUser) {
  document.getElementById('lm-rv-backdrop')?.remove();

  const nS        = _toMin(rawNewLec.startTime);
  const cS        = _toMin(_lecField(conflictLec, 's'));
  const isNewFirst = nS <= cS;

  const prevIsNew  = isNewFirst;
  const prevStart  = prevIsNew ? rawNewLec.startTime          : _lecField(conflictLec, 's');
  const prevEnd    = prevIsNew ? rawNewLec.endTime            : _lecField(conflictLec, 'e');
  const prevTitle  = prevIsNew ? payload.title                : (conflictLec.title  || '(제목 없음)');
  const prevClient = prevIsNew ? payload.client               : (conflictLec.client || '—');
  const prevPlace  = prevIsNew ? (rawNewLec.place  || '—')   : (conflictLec.place  || '—');
  const prevStatus = prevIsNew ? null : (conflictLec.progressStatus ?? conflictLec._status ?? null);
  const nextStart  = prevIsNew ? _lecField(conflictLec, 's')  : rawNewLec.startTime;
  const nextEnd    = prevIsNew ? _lecField(conflictLec, 'e')  : rawNewLec.endTime;
  const nextTitle  = prevIsNew ? (conflictLec.title  || '(제목 없음)') : payload.title;
  const nextClient = prevIsNew ? (conflictLec.client || '—')            : payload.client;
  const nextPlace  = prevIsNew ? (conflictLec.place  || '—') : (rawNewLec.place    || '—');
  const nextStatus = prevIsNew ? (conflictLec.progressStatus ?? conflictLec._status ?? null) : null;

  const isHard        = !!check.isHardConflict;
  const isOnlineCtx   = (rawNewLec.isOnline ?? false) || (conflictLec?.isOnline ?? false);
  const wrapup  = prevIsNew ? (rawNewLec.wrapupTime  ?? 0) : (conflictLec.wrapupTime ?? 0);
  const setup   = prevIsNew ? (conflictLec.setupTime ?? 0) : (rawNewLec.setupTime    ?? 0);
  const travel  = check.travelMin ?? 0;
  const reqGap  = wrapup + travel + setup;
  const actGap  = check.pureGap != null
    ? check.pureGap
    : _toMin(nextStart) - _toMin(prevEnd);
  const delay   = reqGap - actGap;
  const depStr  = _minToStr(_toMin(prevEnd) + wrapup);

  // ── Alternatives ────────────────────────────────────
  const _alts    = check.alternatives ?? {};
  const _optA    = _alts.optionA ?? [];
  const _optB    = _alts.optionB ?? [];
  const _optC    = _alts.optionC ?? null;
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

  const bd = document.createElement('div');
  bd.id        = 'lm-rv-backdrop';
  bd.className = 'lm-rv-bd';
  bd.setAttribute('role', 'dialog');
  bd.setAttribute('aria-modal', 'true');
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
            <span>🚚 예상 이동 시간${isOnlineCtx ? '' : ' (카카오)'}</span>
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

  document.body.appendChild(bd);
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
  setTimeout(() => bd.remove(), 200);
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
      const dirty = ['af-title','af-client','af-fee','af-topic','af-supplies','af-place','af-classroom','af-memo','af-group-info']
        .some(id => (document.getElementById(id)?.value || '').trim() !== '');
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
    if (!placeEl) return;
    if (e.target.checked) {
      placeEl.disabled    = true;
      placeEl.value       = 'Online';
      placeEl.placeholder = '';
      if (required) required.style.display = 'none';
    } else {
      placeEl.disabled    = false;
      placeEl.value       = '';
      placeEl.placeholder = '예) 서울 강남구 SSDC 4F';
      if (required) required.style.display = '';
    }
  });

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
    const get       = id => document.getElementById(id)?.value?.trim() ?? '';
    const date      = get('af-date');
    const timeStart = get('af-time-start');
    const timeEnd   = get('af-time-end');
    const title     = get('af-title');
    const client    = get('af-client');
    const isOnline  = document.getElementById('af-online')?.checked ?? false;
    const place     = isOnline ? 'Online' : get('af-place');
    const feeRaw    = get('af-fee');

    if (!date || !timeStart || !timeEnd || !title || !client || (!isOnline && !place)) {
      window.showToast?.('날짜, 시간, 강의명, 고객사, 강의장소는 필수 입력 항목이에요.', 'error');
      return;
    }
    if (timeEnd <= timeStart) {
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
    const rawSched = JSON.parse(localStorage.getItem('kangbiseo_device') ?? 'null')?.scheduler ?? {};
    const settings = {
      bufferTime:  rawSched.bufferTime === 'custom' ? (Number(rawSched.bufferCustom) || 30) : (Number(rawSched.bufferTime) || 30),
      setupTime:   Number(rawSched.setupTime)  || 20,
      wrapupTime:  Number(rawSched.wrapupTime) || 15,
    };

    const newLec = {
      date,
      startTime:  timeStart,
      endTime:    timeEnd,
      place,
      isOnline,
      setupTime:  Number(get('af-setup-time'))  || 0,
      wrapupTime: Number(get('af-wrapup-time')) || 0,
    };

    const sameDayRaw   = allLectures.filter(l => l.date === date && l.id !== _editingLecId);
    const existingLecs = sameDayRaw.map(l => ({
      date:       l.date,
      startTime:  l.startTime  ?? l.timeStart  ?? '',
      endTime:    l.endTime    ?? l.timeEnd    ?? '',
      place:      l.isOnline ? 'Online' : (l.place ?? ''),
      isOnline:   l.isOnline   ?? false,
      setupTime:  l.setupTime  ?? 0,
      wrapupTime: l.wrapupTime ?? 0,
    }));

    const isPaid  = document.getElementById('af-paid-status')?.value === 'true';
    const taxType = document.getElementById('af-tax')?.value || 'income3_3';

    const payload = {
      date, timeStart, timeEnd, title, client,
      fee:            Number(feeRaw),
      sessionCurrent: Number(get('af-session-current')) || null,
      sessionTotal:   Number(get('af-session-total'))   || null,
      participants:   Number(get('af-participants'))     || null,
      groupInfo:      get('af-group-info'),
      topic:          get('af-topic'),
      setupTime:      Number(get('af-setup-time'))  || 0,
      wrapupTime:     Number(get('af-wrapup-time')) || 0,
      supplies:       get('af-supplies'),
      place,
      isOnline,
      classroom:      get('af-classroom'),
      parkingInfo:    get('af-parking'),
      managerName:    get('af-manager-name'),
      managerPhone:   get('af-manager-phone'),
      managerEmail:   get('af-manager-email'),
      progressStatus: get('af-progress') || 'scheduled',
      isPaid, paymentDate: get('af-payment-date'), taxType,
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

    if (check.status !== 'safe') {
      const conflictLec = _findConflictLec(newLec, sameDayRaw, check);
      _openReviewModal(check, newLec, conflictLec, payload, currentUser);
      return;
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
    if (document.getElementById('lm-rv-backdrop')?.classList.contains('open')) {
      _closeReviewModal();
    } else {
      _closeModal();
      _closeConfirm();
    }
  });

  
}
