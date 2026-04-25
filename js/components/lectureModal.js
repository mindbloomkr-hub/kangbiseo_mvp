// js/components/lectureModal.js — 강의 모달 공통 모듈 (상세보기 + CRUD)

import { db } from '../api.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  TAX_LABEL, PROGRESS_LABEL, STATUS_META,
  escapeHtml, formatDateKo, calcDuration, classifyStatus,
  buildTimeOptions, updateDurationDisplay, syncEndTimeOptions, initTimeSelects,
  checkScheduleConflict,
} from '../utils.js';

/* ════════════════════════════════════════
   모듈 상태 — 페이지 간 공유
════════════════════════════════════════ */
let _activeModalId = null;
let _editingLecId  = null;
let _getCtx        = null; // () => { allLectures, currentUser }
let _classifyFn    = classifyStatus;
let _statusMeta    = STATUS_META;

/* ════════════════════════════════════════
   초기화 — authGuard 내에서 loadModal() 후 호출
   getCtx: () => { allLectures, currentUser }
   opts: { classifyStatus, statusMeta } — 페이지별 오버라이드
════════════════════════════════════════ */
export function initLectureModal(getCtx, opts = {}) {
  _getCtx     = getCtx;
  if (opts.classifyStatus) _classifyFn = opts.classifyStatus;
  if (opts.statusMeta)     _statusMeta = opts.statusMeta;
  initTimeSelects();
  _bindEvents();
}

/* ════════════════════════════════════════
   공개 API — 각 페이지에서 import해서 사용
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

  _switchMode('form');
  _backdrop().classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('af-title')?.focus();
}

/* ════════════════════════════════════════
   내부 헬퍼
════════════════════════════════════════ */
const _backdrop   = () => document.getElementById('modal-backdrop');
const _confirmBd  = () => document.getElementById('confirm-backdrop');

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
  document.getElementById('v-fee').textContent            = `₩${(Number(lec.fee) || 0).toLocaleString()}`;

  document.getElementById('v-session-current').textContent = lec.sessionCurrent ? `${lec.sessionCurrent}회` : '—';
  document.getElementById('v-session-total').textContent   = lec.sessionTotal   ? `${lec.sessionTotal}회`   : '—';
  document.getElementById('v-participants').textContent    = lec.participants    ? `${lec.participants}명`   : '—';
  document.getElementById('v-group-info').textContent      = lec.groupInfo      || '—';
  document.getElementById('v-topic').textContent           = lec.topic          || '—';
  document.getElementById('v-supplies').textContent        = lec.supplies       || '—';
  document.getElementById('v-place').textContent           = lec.place          || '—';
  document.getElementById('v-parking').textContent         = lec.parkingInfo    || '—';

  const mgrName  = lec.managerName  || '';
  const mgrPhone = lec.managerPhone || '';
  const mgrEmail = lec.managerEmail || '';

  document.getElementById('v-mgr-avatar').textContent     = mgrName ? mgrName.charAt(0) : '담';
  document.getElementById('v-mgr-name').textContent       = mgrName  || '담당자 미등록';
  document.getElementById('v-mgr-sub').textContent        = mgrPhone || '연락처 미등록';
  document.getElementById('v-mgr-email-text').textContent = mgrEmail || '—';

  const phoneLink = document.getElementById('v-mgr-phone');
  if (mgrPhone) { phoneLink.href = `tel:${mgrPhone}`;     phoneLink.style.opacity = ''; phoneLink.style.pointerEvents = ''; }
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
  set('af-supplies',        lec.supplies);
  set('af-place',           lec.place);
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
   이벤트 바인딩 — initLectureModal()에서 1회 실행
════════════════════════════════════════ */
function _bindEvents() {
  document.getElementById('modal-close-btn')?.addEventListener('click', _closeModal);

  _backdrop()?.addEventListener('click', e => {
    if (e.target !== _backdrop()) return;
    const formPanel = document.getElementById('form-panel');
    const isFormOpen = formPanel && formPanel.style.display !== 'none';
    if (isFormOpen) {
      const dirty = ['af-title','af-client','af-fee','af-topic','af-supplies','af-place','af-memo','af-group-info']
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
    const get = id => document.getElementById(id)?.value?.trim() ?? '';
    const date = get('af-date'), timeStart = get('af-time-start'), timeEnd = get('af-time-end');
    const title = get('af-title'), client = get('af-client'), feeRaw = get('af-fee');

    if (!date || !timeStart || !timeEnd || !title || !client || !feeRaw) {
      window.showToast?.('날짜, 시간, 강의명, 고객사, 강사료는 필수 입력 항목이에요.', 'error');
      return;
    }
    if (timeEnd <= timeStart) {
      window.showToast?.('종료 시간은 시작 시간보다 이후여야 합니다.', 'error');
      return;
    }

    // 일정 충돌 검사 — 저장 전 차단
    const { allLectures, currentUser } = _getCtx();
    const newLec = { date, startTime: timeStart, endTime: timeEnd, place: get('af-place') };
    const rawSettings = JSON.parse(localStorage.getItem('kangbiseo_device') ?? 'null')?.scheduler;
    const settings    = rawSettings ?? { bufferTime: 30, setupTime: 20 };
    const existingLecs = allLectures
      .filter(l => l.date === date && l.id !== _editingLecId)
      .map(l => ({ date: l.date, startTime: l.timeStart, endTime: l.timeEnd, place: l.place }));
    const check = checkScheduleConflict(newLec, existingLecs, settings);
    if (check.status === 'danger') {
      window.showToast?.(check.msg, 'error');
      return;
    }
    if (check.status === 'warning') {
      if (!window.confirm(check.msg + ' 그래도 저장하시겠습니까?')) return;
    }

    const submitBtn = document.getElementById('btn-form-submit');
    submitBtn.disabled    = true;
    submitBtn.textContent = '저장 중...';

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
      supplies:       get('af-supplies'),
      place:          get('af-place'),
      parkingInfo:    get('af-parking'),
      managerName:    get('af-manager-name'),
      managerPhone:   get('af-manager-phone'),
      managerEmail:   get('af-manager-email'),
      progressStatus: get('af-progress') || 'scheduled',
      isPaid, paymentDate: get('af-payment-date'), taxType,
      memo:           get('af-memo'),
    };

    try {
      if (_editingLecId) {
        await updateDoc(doc(db, 'lectures', _editingLecId), payload);
        window.showToast?.('강의가 수정되었습니다.', 'success');
        const idx = allLectures.findIndex(l => l.id === _editingLecId);
        if (idx >= 0) {
          allLectures[idx] = { ...allLectures[idx], ...payload };
          if (allLectures[idx]._status !== undefined) {
            allLectures[idx]._status = _classifyFn(allLectures[idx]);
          }
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
      }
    } catch (err) {
      console.error('[강비서] 강의 저장 오류:', err);
      window.showToast?.('저장에 실패했습니다.', 'error');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = '저장하기';
    }
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
    if (e.key === 'Escape') { _closeModal(); _closeConfirm(); }
  });
}
