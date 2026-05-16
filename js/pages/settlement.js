// js/pages/settlement.js — 정산 관리 페이지
import { subscribeLectures, authGuard, db, getLectureCache, setLectureCache } from '../api.js';
import {
  calcPaymentDate, calcFee, fmt, resolvePaymentDeadline,
  getTodayString, escapeHtml, formatDateKo,
  calculateSettlementStats, calcPaymentStatus,
} from '../utils.js';
import { PROGRESS_CANCELLED } from '../constants.js';
import { initLectureModal, openModal } from '../components/lectureModal.js';
import {
  doc, updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

/* ════════════════════════════════════════
   상태
════════════════════════════════════════ */
let allLectures  = [];
let currentUser  = null;
let _unsub       = null;

let _isLoading   = true;
let _slPage      = 0;
const SL_PAGE    = 30;

const _filters = {
  dateFrom: '',
  dateTo:   '',
  tab:      'all',   // 'all' | 'paid' | 'pending' | 'overdue' | 'scheduled' | 'na'
  search:   '',
};


/* ════════════════════════════════════════
   D-day 계산
════════════════════════════════════════ */
function _dday(deadline, today) {
  if (!deadline) return null;
  const d0 = new Date(today + 'T00:00:00');
  const d1 = new Date(deadline + 'T00:00:00');
  return Math.round((d1 - d0) / 86400000);
}

function _ddayHtml(deadline, today, status, feeTotal) {
  if (status === 'paid' || status === 'na') return '';
  if (!(feeTotal > 0)) return '';           // 금액 없음 → D-day 계산 생략
  const diff = _dday(deadline, today);
  if (diff === null) return '';
  if (diff > 0) {
    const cls = diff <= 3 ? 'sl-dday--warning' : 'sl-dday--safe';
    return `<span class="sl-dday ${cls}">D-${diff} 입금 대기</span>`;
  }
  if (diff === 0) return `<span class="sl-dday sl-dday--warning">D-Day 입금 대기</span>`;
  return `<span class="sl-dday sl-dday--late">D+${Math.abs(diff)} 연체</span>`;
}

/* ════════════════════════════════════════
   날짜 프리셋
════════════════════════════════════════ */
function _applyPreset(preset) {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const pad   = n => String(n).padStart(2, '0');
  const fmtD  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  let from = '', to = '';

  if (preset === 'this-month') {
    from = `${y}-${pad(m+1)}-01`;
    to   = fmtD(new Date(y, m+1, 0));
  } else if (preset === 'last-month') {
    from = `${y}-${pad(m === 0 ? 12 : m)}-01`;
    const lm = m === 0 ? new Date(y-1, 12, 0) : new Date(y, m, 0);
    to   = fmtD(lm);
    if (m === 0) from = `${y-1}-12-01`;
  } else if (preset === 'quarter') {
    const qStart = Math.floor(m / 3) * 3;
    from = `${y}-${pad(qStart+1)}-01`;
    to   = fmtD(new Date(y, qStart+3, 0));
  } else {
    from = '';
    to   = '';
  }

  _filters.dateFrom = from;
  _filters.dateTo   = to;

  const fromEl = document.getElementById('sl-date-from');
  const toEl   = document.getElementById('sl-date-to');
  if (fromEl) fromEl.value = from;
  if (toEl)   toEl.value   = to;
}

/* ════════════════════════════════════════
   필터링
════════════════════════════════════════ */
function _filtered() {
  const today = getTodayString();
  return allLectures.filter(l => {
    if (l.progressStatus === PROGRESS_CANCELLED) return false;

    const lDate  = (l.date != null ? l.date : '');
    if (_filters.dateFrom && lDate < _filters.dateFrom) return false;
    if (_filters.dateTo   && lDate > _filters.dateTo)   return false;

    const status = calcPaymentStatus(l, today, allLectures);
    if (_filters.tab === 'all') {
      if (status === 'na') return false;          // 'all'은 na 제외, scheduled 포함
    } else if (_filters.tab === 'na') {
      if (status !== 'na') return false;
    } else {
      if (status !== _filters.tab) return false;
    }

    if (_filters.search) {
      const q = _filters.search.toLowerCase();
      if (!l.title?.toLowerCase().includes(q) && !l.client?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (a.date != null ? a.date : '').localeCompare(b.date != null ? b.date : ''));
}

/* ════════════════════════════════════════
   요약 카드 렌더링
════════════════════════════════════════ */
function renderStats() {
  const bar = document.getElementById('sl-stat-bar');
  if (!bar) return;

  const today = getTodayString();
  const { totalAmt, totalCnt, paidAmt, pendingAmt, overdueAmt, paidCnt, pendingCnt, overdueCnt } =
    calculateSettlementStats(allLectures, today);
  console.log('[settlement] overdueCnt:', overdueCnt, 'pendingCnt:', pendingCnt);

  bar.innerHTML = `
    <div class="sl-stat-card">
      <div class="sl-stat-icon sl-stat-icon--blue">📊</div>
      <div class="sl-stat-body">
        <div class="sl-stat-value">${fmt(totalAmt)}</div>
        <div class="sl-stat-label">전체 강의 수익 (${totalCnt}건)</div>
      </div>
    </div>
    <div class="sl-stat-card">
      <div class="sl-stat-icon sl-stat-icon--green">✅</div>
      <div class="sl-stat-body">
        <div class="sl-stat-value">${fmt(paidAmt)}</div>
        <div class="sl-stat-label">입금 완료 (${paidCnt}건)</div>
      </div>
    </div>
    <div class="sl-stat-card">
      <div class="sl-stat-icon sl-stat-icon--yellow">⏳</div>
      <div class="sl-stat-body">
        <div class="sl-stat-value">${fmt(pendingAmt)}</div>
        <div class="sl-stat-label">입금 대기 (${pendingCnt}건)</div>
      </div>
    </div>
    <div class="sl-stat-card${overdueCnt > 0 ? ' sl-stat-card--overdue' : ''}">
      <div class="sl-stat-icon sl-stat-icon--red">🚨</div>
      <div class="sl-stat-body">
        <div class="sl-stat-value">${fmt(overdueAmt)}</div>
        <div class="sl-stat-label">미입금 / 연체 (${overdueCnt}건)</div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   테이블 렌더링
════════════════════════════════════════ */
function _slSkeletonRows(n = 5) {
  return Array.from({ length: n }, () => `
    <tr class="skeleton-row">
      <td><span class="skeleton-cell skeleton-cell--medium"></span></td>
      <td><span class="skeleton-cell skeleton-cell--long"></span></td>
      <td><span class="skeleton-cell skeleton-cell--medium"></span></td>
      <td><span class="skeleton-cell skeleton-cell--short"></span></td>
      <td><span class="skeleton-cell skeleton-cell--medium"></span></td>
      <td><span class="skeleton-cell skeleton-cell--badge"></span></td>
      <td><span class="skeleton-cell skeleton-cell--short"></span></td>
    </tr>`).join('');
}

function _renderSlPagination(tbody, total) {
  let bar = document.getElementById('sl-pagination');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sl-pagination';
    bar.className = 'sl-pagination';
    tbody.closest('table')?.after(bar);
  }
  const totalPages = Math.max(1, Math.ceil(total / SL_PAGE));
  if (totalPages <= 1) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = `
    <button class="sl-pagination__btn" id="sl-pg-prev" ${_slPage === 0 ? 'disabled' : ''}>← 이전</button>
    <span class="sl-pagination__info">${_slPage + 1}/${totalPages}</span>
    <button class="sl-pagination__btn" id="sl-pg-next" ${_slPage >= totalPages - 1 ? 'disabled' : ''}>다음 →</button>`;
  bar.querySelector('#sl-pg-prev')?.addEventListener('click', () => { _slPage--; render(); });
  bar.querySelector('#sl-pg-next')?.addEventListener('click', () => { _slPage++; render(); });
}

function renderTable() {
  const tbody   = document.getElementById('sl-table-body');
  const countEl = document.getElementById('sl-result-count');
  if (!tbody) return;

  if (_isLoading && allLectures.length === 0) {
    if (countEl) countEl.textContent = '로딩 중...';
    tbody.innerHTML = _slSkeletonRows(5);
    return;
  }

  const today = getTodayString();
  const rows  = _filtered();

  if (countEl) countEl.textContent = `${rows.length}건 표시`;

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="sl-empty">
          <div class="sl-empty-icon">🔍</div>
          <p>조건에 맞는 강의가 없어요.</p>
        </div>
      </td></tr>`;
    _renderSlPagination(tbody, 0);
    return;
  }

  const totalFilteredFee = rows.reduce((s, l) => s + calcFee(l), 0);
  const summaryFeeStr    = fmt(totalFilteredFee);

  const start = _slPage * SL_PAGE;
  const page  = rows.slice(start, start + SL_PAGE);

  tbody.innerHTML = page.map(l => {
    const fee                 = calcFee(l);
    const status              = calcPaymentStatus(l, today, allLectures);
    const expectedPaymentDate = resolvePaymentDeadline(l, allLectures);
    const dateStr             = l.date ? formatDateKo(l.date).main : '—';
    const feeStr              = fee > 0 ? fmt(fee) : '—';
    const ddHtml              = _ddayHtml(expectedPaymentDate, today, status, fee);

    const statusBadge = status === 'paid'
      ? `<span class="sl-status-badge sl-status-badge--paid">✓ 입금 완료</span>`
      : status === 'na'
        ? `<span class="sl-status-badge sl-status-badge--record">기록</span>`
        : status === 'overdue'
          ? `<span class="sl-status-badge sl-status-badge--overdue">🚨 연체${ddHtml}</span>`
          : status === 'scheduled'
            ? `<span class="sl-status-badge sl-status-badge--scheduled">📅 미진행</span>`
            : `<span class="sl-status-badge sl-status-badge--pending">⏳ 입금 대기${ddHtml}</span>`;

    const isPaid       = status === 'paid';
    const isNa         = status === 'na';
    const isScheduled  = status === 'scheduled';
    const rowCls       = status === 'overdue'   ? ' class="sl-row--overdue"'
                       : status === 'scheduled' ? ' class="sl-row--scheduled"'
                       : isNa                   ? ' class="sl-row--na"'
                       : '';

    return `
      <tr${rowCls} data-id="${escapeHtml(l.id)}">
        <td class="sl-cell-date">${dateStr}</td>
        <td><div class="sl-cell-title" title="${escapeHtml(l.title)}">${escapeHtml(l.title)}</div></td>
        <td><div class="sl-cell-client" title="${escapeHtml(l.client || '')}">${escapeHtml(l.client || '—')}</div></td>
        <td class="sl-cell-amount">${feeStr}</td>
        <td class="sl-cell-date">${isNa || isScheduled ? '—' : (expectedPaymentDate || '—')}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="sl-actions">
            <button class="sl-btn sl-btn--pay" data-id="${escapeHtml(l.id)}"
                    ${isPaid || isNa || isScheduled ? 'disabled' : ''}>
              ${isPaid ? '완료' : isNa ? '—' : isScheduled ? '미진행' : '입금 확인'}
            </button>
            ${isNa || isScheduled ? '' : `<button class="sl-btn sl-btn--invoice" data-invoice-id="${escapeHtml(l.id)}">청구서</button>`}
          </div>
        </td>
      </tr>`;
  }).join('') + `
    <tr class="sl-summary-row">
      <td colspan="3" class="sl-summary-label">합계 ${rows.length}건</td>
      <td class="sl-cell-amount sl-summary-amount">${summaryFeeStr}</td>
      <td colspan="3"></td>
    </tr>`;

  _renderSlPagination(tbody, rows.length);
}

function render() {
  renderStats();
  renderTable();
}

/* ════════════════════════════════════════
   입금 확인 처리
════════════════════════════════════════ */
async function _confirmPayment(id) {
  const lec = allLectures.find(l => l.id === id);
  if (!lec || lec.isPaid) return;
  try {
    await updateDoc(doc(db, 'lectures', id), { isPaid: true, paidStatus: 'true' });
    window.showToast?.('입금 확인 처리되었습니다.', 'success');
  } catch (err) {
    console.error('[강비서] 입금 확인 오류:', err);
    window.showToast?.('처리 중 오류가 발생했습니다.', 'error');
  }
}

/* ════════════════════════════════════════
   청구서 생성 (Print/PDF)
════════════════════════════════════════ */
function _generateInvoice(id) {
  const lec = allLectures.find(l => l.id === id);
  if (!lec) return;

  const deadline = resolvePaymentDeadline(lec, allLectures) || '—';
  const feeAmt   = calcFee(lec);
  const fee      = feeAmt > 0 ? fmt(feeAmt) : '—';
  const dateStr  = lec.date ? formatDateKo(lec.date).full : '—';

  const win = window.open('', '_blank', 'width=700,height=900');
  if (!win) { window.showToast?.('팝업 차단을 해제해 주세요.', 'error'); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <title>청구서 — ${escapeHtml(lec.title)}</title>
  <style>
    body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; margin: 40px; color: #1f2937; }
    h1   { font-size: 1.6rem; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 0.9rem; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { padding: 12px 16px; border: 1px solid #e5e7eb; text-align: left; }
    th  { background: #f9fafb; font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #6b7280; }
    .total-row td { font-weight: 700; font-size: 1.05rem; background: #f0f6ff; }
    .footer { margin-top: 40px; font-size: 0.8rem; color: #9ca3af; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>강의 청구서</h1>
  <p class="subtitle">강비서 자동 생성 · ${new Date().toLocaleDateString('ko-KR')}</p>
  <table>
    <tr><th>항목</th><th>내용</th></tr>
    <tr><td>강의명</td><td>${escapeHtml(lec.title)}</td></tr>
    <tr><td>기관명</td><td>${escapeHtml(lec.client || '—')}</td></tr>
    <tr><td>강의 일자</td><td>${dateStr}</td></tr>
    <tr><td>정산 예정일</td><td>${deadline}</td></tr>
    <tr class="total-row"><td>청구 금액</td><td>${fee}</td></tr>
  </table>
  <p class="footer">본 청구서는 강비서에서 자동 생성되었습니다.</p>
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`);
  win.document.close();
}

/* ════════════════════════════════════════
   이벤트 바인딩
════════════════════════════════════════ */
function _bindEvents() {
  // Date presets
  document.getElementById('sl-date-preset')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    document.querySelectorAll('.sl-preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _applyPreset(btn.dataset.preset);
    _slPage = 0;
    renderTable();
  });

  // Manual date range
  document.getElementById('sl-date-from')?.addEventListener('change', e => {
    _filters.dateFrom = e.target.value;
    document.querySelectorAll('.sl-preset-btn').forEach(b => b.classList.remove('active'));
    _slPage = 0;
    renderTable();
  });

  document.getElementById('sl-date-to')?.addEventListener('change', e => {
    _filters.dateTo = e.target.value;
    document.querySelectorAll('.sl-preset-btn').forEach(b => b.classList.remove('active'));
    _slPage = 0;
    renderTable();
  });

  // Status tabs
  document.getElementById('sl-tab-group')?.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    _filters.tab = tab.dataset.tab;
    document.querySelectorAll('.sl-tab').forEach(t => {
      t.classList.remove('active', 'active--paid', 'active--pending', 'active--overdue', 'active--scheduled', 'active--na');
    });
    tab.classList.add('active');
    if (_filters.tab !== 'all') tab.classList.add(`active--${_filters.tab}`);
    _slPage = 0;
    renderTable();
  });

  // Search
  document.getElementById('sl-search')?.addEventListener('input', e => {
    _filters.search = e.target.value.trim();
    _slPage = 0;
    renderTable();
  });

  // Table action buttons + title click (event delegation)
  document.getElementById('sl-table-body')?.addEventListener('click', async e => {
    const titleCell  = e.target.closest('.sl-cell-title');
    const payBtn     = e.target.closest('.sl-btn--pay');
    const invoiceBtn = e.target.closest('.sl-btn--invoice');

    if (titleCell) {
      const row = titleCell.closest('tr[data-id]');
      if (row) openModal(row.dataset.id);
    } else if (payBtn && !payBtn.disabled) {
      await _confirmPayment(payBtn.dataset.id);
    } else if (invoiceBtn) {
      _generateInvoice(invoiceBtn.dataset.invoiceId);
    }
  });
}

/* ════════════════════════════════════════
   초기화 — URL 파라미터 처리
════════════════════════════════════════ */
function _applyUrlParams() {
  const params = new URLSearchParams(location.search);
  const filter = params.get('filter');
  if (filter === 'overdue' || filter === 'pending' || filter === 'paid' || filter === 'scheduled' || filter === 'na') {
    _filters.tab = filter;
    document.querySelectorAll('.sl-tab').forEach(t => {
      t.classList.remove('active', 'active--paid', 'active--pending', 'active--overdue', 'active--scheduled', 'active--na');
      if (t.dataset.tab === filter) {
        t.classList.add('active', `active--${filter}`);
      }
    });
  }
}

/* ════════════════════════════════════════
   인증 가드 + Firestore 구독
════════════════════════════════════════ */
_bindEvents();

authGuard(async user => {
  currentUser = user;

  _applyUrlParams();
  await initLectureModal(() => ({ allLectures, currentUser }));

  // Show cached data instantly
  const cached = getLectureCache(user.uid);
  if (cached && cached.length > 0) {
    allLectures = cached;
    _isLoading  = false;
    render();
  }

  _unsub = subscribeLectures(user.uid, snap => {
    allLectures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _isLoading  = false;
    setLectureCache(user.uid, allLectures);
    render();
  }, err => console.error('[강비서] 정산 구독 오류:', err));
}, {
  withModal: true,
  cleanupFn: () => { if (_unsub) _unsub(); },
});
