// js/utils.js — 공통 상수 & 유틸리티 (ES Module)
import {
  REVENUE_UNIT, PROGRESS_DONE, PROGRESS_CANCELLED,
  EARLY_DEP_MIN, RETURN_LIMIT_MIN,
  FALLBACK_SPEED_KMH, SLOT_DAY_START, SLOT_DAY_END,
  DEFAULT_SETUP_MIN, DEFAULT_WRAPUP_MIN, DEFAULT_BUFFER_MIN,
} from './constants.js';

/* ════════════════════════════════════════
   상수
════════════════════════════════════════ */
export const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
export const IN_7DAYS = new Date(TODAY.getTime() + 7 * 24 * 60 * 60 * 1000);

export const TAX_LABEL = {
  income3_3: '사업소득 3.3%',
  income8_8: '기타소득 8.8%',
  exempt:    '면세',
  other:     '기타',
  na:        '해당없음',
};

export const PROGRESS_LABEL = {
  discussing: '논의 중',
  scheduled:  '진행 예정',
  done:       '진행 완료',
  onhold:     '보류 중',
  cancelled:  '취소/드롭',
  needs_review: '확인 필요',
};

export const STATUS_META = {
  discussing:   { label: '💬 논의 중',    cls: 'lec-badge--discussing'  },
  scheduled:    { label: '📅 진행 예정',  cls: 'lec-badge--scheduled'   },
  done:         { label: '✅ 진행 완료',  cls: 'lec-badge--done'        },
  onhold:       { label: '⏸️ 보류 중',    cls: 'lec-badge--onhold'      },
  cancelled:    { label: '❌ 취소/드롭',  cls: 'lec-badge--cancelled'   },
  urgent:       { label: '⚠️ 준비 임박',  cls: 'lec-badge--urgent'      },
  unpaid:       { label: '💰 미입금',     cls: 'lec-badge--unpaid'      },
  needs_review: { label: '🔍 확인필요',   cls: 'lec-badge--review'      },
};

/* ════════════════════════════════════════
   날짜 유틸
════════════════════════════════════════ */
/**
 * YYYY-MM-DD 문자열을 자정(00:00:00) 기준 Date 객체로 변환한다.
 * @param {string} str - 'YYYY-MM-DD' 형식 날짜 문자열
 * @returns {Date} 자정 기준 Date 객체
 */
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * 오늘 날짜를 'YYYY-MM-DD' 문자열로 반환한다. 매 호출 시 현재 시각 기준으로 계산된다.
 * @returns {string} 'YYYY-MM-DD' 형식 오늘 날짜
 */
export function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Date 객체를 'YYYY-MM-DD' 문자열로 변환한다.
 * @param {Date} date - 변환할 Date 객체
 * @returns {string} 'YYYY-MM-DD' 형식 문자열
 */
export function formatDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

/**
 * 정산 주기에 따른 입금 예정일을 계산한다.
 * @param {string} date     - 기준 날짜 'YYYY-MM-DD' (강의 날짜 또는 종료일)
 * @param {string} cycle    - 정산 주기 ('per-session'|'monthly'|'quarterly'|'after-completion'|기타)
 * @param {string|null} lastDate - 'after-completion' 사용 시 그룹 마지막 강의 날짜
 * @returns {string} 입금 예정일 'YYYY-MM-DD'
 */
export function calcPaymentDate(date, cycle, lastDate) {
  const d = new Date(date + 'T00:00:00');
  switch (cycle) {
    case 'per-session': {
      d.setDate(d.getDate() + 14);
      return formatDateString(d);
    }
    case 'monthly': {
      return formatDateString(new Date(d.getFullYear(), d.getMonth() + 1, 20));
    }
    case 'quarterly': {
      // 20th of the month after the quarter ends (Apr/Jul/Oct/Jan)
      const nextQAfterEnd = (Math.floor(d.getMonth() / 3) + 1) * 3;
      return formatDateString(new Date(d.getFullYear(), nextQAfterEnd, 20));
    }
    case 'after-completion': {
      // 20th of the following month after the last session
      const last = new Date((lastDate || date) + 'T00:00:00');
      return formatDateString(new Date(last.getFullYear(), last.getMonth() + 1, 20));
    }
    default: {
      return '';
    }
  }
}

/* ════════════════════════════════════════
   정산 공용 헬퍼 — home.js · settlement.js 공유
   단일 함수에서 계산하므로 두 페이지 간 값이 항상 일치
════════════════════════════════════════ */
/**
 * 강의 객체에서 수강료(만원 단위)를 읽는다. feeAmount 우선, fee 폴백.
 * @param {Object} lec - 강의 Firestore 문서 데이터
 * @returns {number} 수강료(만원 단위), 없으면 0
 */
export function calcFee(lec) {
  return Number(lec.feeAmount != null ? lec.feeAmount : (lec.fee != null ? lec.fee : 0));
}

export function resolvePaymentDeadline(lec, allLectures) {
  if (lec.paymentDate) return lec.paymentDate;
  if (lec.settlementCycle === 'after-completion' && lec.groupId) {
    const lastDate = allLectures
      .filter(l => l.groupId === lec.groupId)
      .reduce((max, l) => { const d = (l.endDate != null ? l.endDate : (l.date != null ? l.date : '')); return d > max ? d : max; }, '');
    const baseDate = lastDate || (lec.endDate != null ? lec.endDate : (lec.date != null ? lec.date : ''));
    return baseDate ? calcPaymentDate(baseDate, 'after-completion', lastDate || null) : null;
  }
  const baseDate = lec.endDate != null ? lec.endDate : (lec.date != null ? lec.date : '');
  return baseDate ? calcPaymentDate(baseDate, lec.settlementCycle || '', null) : null;
}

/**
 * 강의의 정산 상태를 계산한다.
 * @param {Object}   lec         - 강의 Firestore 문서 데이터
 * @param {string}   todayStr    - 오늘 날짜 'YYYY-MM-DD'
 * @param {Object[]} allLectures - 그룹 정산 기준일 계산에 필요한 전체 강의 배열
 * @returns {'paid'|'pending'|'overdue'|'scheduled'|'na'}
 *   paid=입금완료, pending=입금대기, overdue=연체, scheduled=미진행, na=비정산
 */
export function calcPaymentStatus(lec, todayStr, allLectures = []) {
  // 1. Paid check — highest priority
  const ps = lec.paidStatus || (lec.isPaid === true ? 'true' : 'false');
  if (ps === 'true' || lec.isPaid === true) return 'paid';

  // 2. Explicitly excluded from settlement tracking
  if (ps === 'na') return 'na';

  // 3. No paymentDate set → not tracked
  if (!lec.paymentDate) return 'na';

  // 4. Past payment deadline
  if (lec.paymentDate < todayStr) return 'overdue';

  // 5. Classify by lecture completion
  const lecDate    = lec.endDate != null ? lec.endDate : (lec.date != null ? lec.date : '');
  const isFinished = lec.progressStatus === PROGRESS_DONE
    || (lec.progressStatus !== PROGRESS_CANCELLED && lecDate !== '' && lecDate < todayStr);
  return isFinished ? 'pending' : 'scheduled';
}

/**
 * 전체 강의 배열에서 정산 통계를 계산한다.
 * totalAmt/totalCnt는 취소·비정산 제외 전체 예상 수익(미진행 포함).
 * paid/pending/overdue는 완료된 강의(isFinished)만 집계한다.
 * @param {Object[]} allLectures - 전체 강의 배열
 * @param {string}   todayStr    - 오늘 날짜 'YYYY-MM-DD'
 * @returns {{
 *   totalAmt: number, totalCnt: number,
 *   paidAmt: number, paidCnt: number,
 *   pendingAmt: number, pendingCnt: number, pendingLecs: Object[],
 *   overdueAmt: number, overdueCnt: number, overdueLecs: Object[],
 *   scheduledAmt: number, scheduledCnt: number, scheduledLecs: Object[]
 * }}
 */
export function calculateSettlementStats(allLectures, todayStr) {
  const overdueLecs = [], pendingLecs = [], scheduledLecs = [];
  // totalAmt/totalCnt: 전체 파이프라인 (취소·비정산 제외, scheduled 포함)
  let totalAmt = 0, totalCnt = 0;
  let paidAmt = 0, pendingAmt = 0, overdueAmt = 0, scheduledAmt = 0;
  let paidCnt = 0, pendingCnt = 0, overdueCnt = 0, scheduledCnt = 0;
  for (const l of allLectures) {
    if (l.progressStatus === PROGRESS_CANCELLED) continue;
    const fee    = calcFee(l);
    const status = calcPaymentStatus(l, todayStr, allLectures);
    if (status === 'na') continue;
    if (fee > 0) { totalAmt += fee; totalCnt++; }
    if (status === 'scheduled') { scheduledLecs.push(l); scheduledAmt += fee; scheduledCnt++; }
    else if (status === 'paid')    { paidAmt    += fee; paidCnt++;    }
    else if (status === 'pending') { pendingLecs.push(l); pendingAmt += fee; pendingCnt++; }
    else if (status === 'overdue') { overdueLecs.push(l); overdueAmt += fee; overdueCnt++; }
  }
  return {
    totalAmt, totalCnt,
    paidAmt, paidCnt,
    pendingAmt, pendingCnt, pendingLecs,
    overdueAmt, overdueCnt, overdueLecs,
    scheduledAmt, scheduledCnt, scheduledLecs,
  };
}

/**
 * 날짜 문자열을 한국어 표기 형식으로 변환한다.
 * @param {string} dateStr - 'YYYY-MM-DD' 형식 날짜 문자열
 * @returns {{ main: string, day: string, full: string }}
 *   main='M/D', day='요일(한글)', full='YYYY. M. D (요일)'
 */
export function formatDateKo(dateStr) {
  const d = parseDate(dateStr);
  return {
    main: `${d.getMonth() + 1}/${d.getDate()}`,
    day:  DAY_KO[d.getDay()],
    full: `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${DAY_KO[d.getDay()]})`,
  };
}

/* ════════════════════════════════════════
   범용 유틸
════════════════════════════════════════ */
/**
 * HTML 특수문자를 엔티티로 이스케이프한다.
 * @param {*} str - 이스케이프할 값 (null/undefined → 빈 문자열)
 * @returns {string} 이스케이프된 문자열
 */
export function escapeHtml(str) {
  return String(str != null ? str : '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 금액(만원 단위)을 ₩ 포맷 문자열로 변환한다.
 * @param {number} n - 만원 단위 금액
 * @returns {string} '₩1,234,000' 형식 문자열, n <= 0이면 '₩0'
 */
export function fmt(n) {
  return n > 0 ? `₩${(n * REVENUE_UNIT).toLocaleString()}` : '₩0';
}

/**
 * 스케줄 충돌 검사(checkScheduleConflict) warning 결과를 토스트 메시지로 변환한다.
 * 두 모달(lectureModal, multiSessionModal)에서 동일한 경고 메시지를 표시하기 위한 공통 헬퍼.
 * @param {Object} check - checkScheduleConflict 반환값 (status='warning')
 * @returns {{message: string, type: string}|null} 토스트 파라미터, 해당 없으면 null
 */
export function formatConflictWarning(check) {
  if (check.msg === 'public_transit') {
    return { message: '대중교통 기반 이동 시간 계산은 현재 준비 중입니다.', type: 'info' };
  }
  const travelStr = `${check.travelMin}분${check.isFallback ? ' 추정' : ''}`;
  if (check.msg === 'early_departure') {
    const depTime = check.depMin != null
      ? minToTime(((check.depMin % 1440) + 1440) % 1440)
      : null;
    const message = depTime
      ? `⚠️ 출발지 기준 이동(${travelStr}) 포함 시 ${depTime} 이전 출발이 필요합니다.`
      : `⚠️ 출발지 기준 이동(${travelStr}) 포함 시 이른 출발이 필요합니다.`;
    return { message, type: 'warning' };
  }
  if (check.msg === 'late_return') {
    const retTime = check.returnMin != null
      ? minToTime(((check.returnMin % 1440) + 1440) % 1440)
      : null;
    const message = retTime
      ? `⚠️ 강의 후 귀가(${travelStr})까지 포함 시 ${retTime} 귀가 예정입니다.`
      : `⚠️ 강의 후 귀가(${travelStr})까지 포함 시 늦은 귀가가 예상됩니다.`;
    return { message, type: 'warning' };
  }
  return null;
}

/**
 * HEX 색상 코드를 rgba() 문자열로 변환한다.
 * @param {string} hex   - '#RRGGBB' 또는 '#RGB' 형식
 * @param {number} alpha - 불투명도 0~1
 * @returns {string} 'rgba(r,g,b,alpha)' 문자열, 파싱 실패 시 원본 hex 반환
 */
export function hexToRgba(hex, alpha) {
  let h = (hex != null ? hex : '').replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
  return `rgba(${r},${g},${b},${alpha})`;
}

function _formatDuration(totalMin) {
  const days = Math.floor(totalMin / 1440);
  const h    = Math.floor((totalMin % 1440) / 60);
  const m    = totalMin % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}일`);
  if (h    > 0) parts.push(`${h}시간`);
  if (m    > 0) parts.push(`${m}분`);
  return parts.length ? parts.join(' ') : '—';
}

function _calcMultiDayDuration(startDate, startTime, endDate, endTime) {
  const [sy, smo, sd] = (startDate || '').split('-').map(Number);
  const [sh, smm]     = (startTime  || '').split(':').map(Number);
  const [ey, emo, ed] = (endDate   || '').split('-').map(Number);
  const [eh, emm]     = (endTime   || '').split(':').map(Number);
  if ([sy, smo, sd, sh, smm, ey, emo, ed, eh, emm].some(v => isNaN(v))) return '—';
  const start = new Date(sy, smo - 1, sd, sh, smm);
  const end   = new Date(ey, emo - 1, ed, eh, emm);
  const totalMin = Math.round((end - start) / 60000);
  return totalMin > 0 ? _formatDuration(totalMin) : '—';
}

/**
 * 강의 시간을 사람이 읽기 쉬운 문자열로 계산한다.
 * 2인자 형식: 같은 날 (startTime, endTime).
 * 4인자 형식: 다중일 (startDate, startTime, endDate, endTime).
 * @param {string} p1       - 시작 시각 'HH:MM' 또는 시작 날짜 'YYYY-MM-DD'
 * @param {string} p2       - 종료 시각 'HH:MM' 또는 시작 시각 'HH:MM'
 * @param {string} [endDate]  - (4인자) 종료 날짜 'YYYY-MM-DD'
 * @param {string} [endTime]  - (4인자) 종료 시각 'HH:MM'
 * @returns {string} 예: '2시간 30분', '1일 4시간', 계산 불가 시 '—'
 */
export function calcDuration(p1, p2, endDate, endTime) {
  if (endDate !== undefined) return _calcMultiDayDuration(p1, p2, endDate, endTime);
  if (!p1 || !p2) return '—';
  const [sh, sm] = p1.split(':').map(Number);
  const [eh, em] = p2.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return '—';
  const total = (eh * 60 + em) - (sh * 60 + sm);
  return total > 0 ? _formatDuration(total) : '—';
}

/* ════════════════════════════════════════
   강의 상태 자동 분류 (기본)
   calendar.js는 doc 상태가 추가되므로 로컬에서 오버라이드한다.
════════════════════════════════════════ */
/**
 * 강의의 표시 상태를 자동 분류한다 (캘린더·강의 목록용).
 * 정산 상태 판별에는 calcPaymentStatus를 사용할 것.
 * @param {Object} lec - 강의 Firestore 문서 데이터
 * @returns {'cancelled'|'unpaid'|'urgent'|'discussing'|'scheduled'|'done'|'onhold'|'needs_review'}
 */
export function classifyStatus(lec) {
  const prog = lec.progressStatus || 'scheduled';

  // Priority 1: cancelled always wins
  if (prog === 'cancelled') return 'cancelled';

  const d = parseDate(lec.date);

  // Priority 2: unpaid alert — past date OR done status, AND not yet paid, AND payment is not N/A
  const _paidStatus = lec.paidStatus || (lec.isPaid ? 'true' : 'false');
  const _isPaymentNa = _paidStatus === 'na' || lec.taxType === 'na';
  if (!_isPaymentNa && !lec.isPaid && (d < TODAY || prog === 'done')) return 'unpaid';

  // Priority 3: urgent alert — confirmed scheduled lecture within 7 days
  if (prog === 'scheduled' && d >= TODAY && d <= IN_7DAYS) return 'urgent';

  // Remaining: return actual progress status (discussing | scheduled | done | onhold)
  return prog;
}

/* ════════════════════════════════════════
   시간 선택 (10분 단위 select)
   모달 강의 폼 공통 사용 (af-time-start / af-time-end / af-duration-computed)
════════════════════════════════════════ */
/**
 * 강의 시간 선택용 &lt;option&gt; HTML 문자열을 생성한다 (07:00~22:00, 10분 단위).
 * @param {string} [minAfter=''] - 이 시각보다 나중 시각만 포함 ('HH:MM'), 생략 시 전체
 * @returns {string} &lt;option&gt; 태그 문자열
 */
export function buildTimeOptions(minAfter = '') {
  const opts = ['<option value="">시간 선택</option>'];
  for (let h = 7; h <= 22; h++) {
    for (let m = 0; m < 60; m += 10) {
      if (h === 22 && m > 0) break;
      const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (!minAfter || t > minAfter) opts.push(`<option value="${t}">${t}</option>`);
    }
  }
  return opts.join('');
}

/**
 * 00:00~23:50(10분 단위) 전체 시각 선택용 &lt;option&gt; HTML 문자열을 생성한다.
 * 다중일 강의 종료 시각 선택에 사용된다.
 * @returns {string} &lt;option&gt; 태그 문자열
 */
export function buildAllTimeOptions() {
  const opts = ['<option value="">시간 선택</option>'];
  for (let h = 0; h <= 23; h++) {
    for (let m = 0; m < 60; m += 10) {
      const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      opts.push(`<option value="${t}">${t}</option>`);
    }
  }
  return opts.join('');
}

/**
 * 강의 폼의 시작·종료 시각을 읽어 #af-duration-computed 입력 필드를 갱신한다.
 * 다중일 강의 여부를 자동 감지한다.
 */
export function updateDurationDisplay() {
  const start     = document.getElementById('af-time-start')?.value;
  const end       = document.getElementById('af-time-end')?.value;
  const startDate = document.getElementById('af-date')?.value;
  const endDate   = document.getElementById('af-end-date')?.value;
  const el        = document.getElementById('af-duration-computed');
  if (!el || !start || !end) { if (el) el.value = ''; return; }
  const crossDay = !!(startDate && endDate && startDate !== endDate);
  el.value = crossDay ? calcDuration(startDate, start, endDate, end) : calcDuration(start, end);
}

/**
 * 종료 시각 선택지를 시작 시각에 맞게 재생성하고 기존 값을 유지한다.
 * @param {string}  [keepValue=''] - 재생성 후 유지할 종료 시각 값 'HH:MM'
 * @param {boolean} [crossDay=false] - true면 전체 시각(00:00~23:50) 표시
 */
export function syncEndTimeOptions(keepValue = '', crossDay = false) {
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (!startSel || !endSel) return;
  const prev = keepValue || endSel.value;
  endSel.innerHTML = crossDay ? buildAllTimeOptions() : buildTimeOptions(startSel.value);
  if (prev) endSel.value = prev;
  updateDurationDisplay();
}

/**
 * 강의 폼의 시작·종료 시각 select를 초기화하고 change 이벤트를 바인딩한다.
 * lectureModal 초기화 시점에 한 번 호출한다.
 */
export function initTimeSelects() {
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (startSel) startSel.innerHTML = buildTimeOptions();
  if (endSel)   endSel.innerHTML   = buildTimeOptions();
  const _crossDay = () => {
    const d1 = document.getElementById('af-date')?.value;
    const d2 = document.getElementById('af-end-date')?.value;
    return !!(d1 && d2 && d1 !== d2);
  };
  startSel?.addEventListener('change', () => syncEndTimeOptions('', _crossDay()));
  endSel?.addEventListener('change',   updateDurationDisplay);
  document.getElementById('af-date')?.addEventListener('change',
    () => syncEndTimeOptions(endSel?.value || '', _crossDay()));
  document.getElementById('af-end-date')?.addEventListener('change',
    () => syncEndTimeOptions(endSel?.value || '', _crossDay()));
}

/* ════════════════════════════════════════
   Toast 알림 공통 래퍼
   'warn'·'info' 타입을 'default'로 정규화한다.
════════════════════════════════════════ */
/**
 * 토스트 알림을 표시한다. warn/info 타입은 'default'로 정규화한다.
 * @param {string} msg               - 표시할 메시지
 * @param {'default'|'success'|'error'|'warn'|'info'} [type='default'] - 알림 유형
 */
export function showToast(msg, type = 'default') {
  const map = { success: 'success', error: 'error', warn: 'default', info: 'default' };
  window.showToast?.(msg, map[type] || 'default');
}

/**
 * id로 입력 요소를 찾아 값을 설정한다.
 * @param {string} id  - 요소 id
 * @param {*}      val - 설정할 값 (null/undefined → 빈 문자열)
 */
export function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = (val != null ? val : ''); }

/**
 * id로 입력 요소를 찾아 현재 값을 반환한다.
 * @param {string} id - 요소 id
 * @returns {string} 요소 값, 요소가 없으면 빈 문자열
 */
export function getVal(id)       { const _el = document.getElementById(id); return (_el != null && _el.value != null ? _el.value : ''); }

/* ════════════════════════════════════════
   사이드바 UI 업데이트
════════════════════════════════════════ */
/**
 * 사이드바의 사용자 이름과 아바타 이니셜을 업데이트한다.
 * @param {string} nickname - 표시할 강사 닉네임
 */
export function updateSidebarUI(nickname) {
  const nameEl   = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (!nameEl) return;
  nameEl.textContent = nickname + ' 강사';
  if (avatarEl) avatarEl.textContent = nickname.charAt(0);
}

/* ════════════════════════════════════════
   사이드바 동적 로드 — components/sidebar.html fetch 후 주입
   common.js의 initSidebar IIFE 실행 시점에는 sidebar가 없으므로
   inject 후 동작을 여기서 재초기화한다.
════════════════════════════════════════ */
/**
 * components/sidebar.html을 fetch하여 #app-main 앞에 삽입하고 동작을 초기화한다.
 * 각 페이지 초기화 시 한 번 호출한다.
 * @returns {Promise<void>}
 */
export async function loadSidebar() {
  try {
    const res  = await fetch('../components/sidebar.html');
    const html = await res.text();
    const tmp  = document.createElement('div');
    tmp.innerHTML = html;

    const appMain = document.getElementById('app-main');
    if (!appMain) return;
    const parent = appMain.parentNode;
    while (tmp.firstElementChild) {
      parent.insertBefore(tmp.firstElementChild, appMain);
    }

    _initSidebarBehavior();

    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(item => {
      if (currentPath.endsWith(item.dataset.page)) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'page');
      }
    });

    const count  = parseInt(localStorage.getItem('navBadgeCount') || '0', 10);
    const badge  = document.getElementById('nav-badge-lectures');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
  } catch (err) {
    console.error('[강비서] 사이드바 로드 오류:', err);
  }
}

function _initSidebarBehavior() {
  const sidebar    = document.getElementById('sidebar');
  const appMain    = document.getElementById('app-main');
  const toggleBtn  = document.getElementById('sidebar-toggle');
  const overlay    = document.getElementById('sidebar-overlay');
  const mobileBtn  = document.getElementById('mobile-menu-btn');
  if (!sidebar) return;

  if (localStorage.getItem('sidebar-collapsed') === 'true') {
    sidebar.classList.add('collapsed');
    appMain?.classList.add('sidebar-collapsed');
  }

  toggleBtn?.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    appMain?.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem('sidebar-collapsed', collapsed);
  });

  function openMobile()  { sidebar.classList.add('mobile-open');    overlay?.classList.add('active');    document.body.style.overflow = 'hidden'; }
  function closeMobile() { sidebar.classList.remove('mobile-open'); overlay?.classList.remove('active'); document.body.style.overflow = ''; }

  mobileBtn?.addEventListener('click', openMobile);
  overlay?.addEventListener('click',   closeMobile);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobile(); });
}

/* ════════════════════════════════════════
   일정 충돌 검사 — 3단계 엔진 + 대안 제안
════════════════════════════════════════ */

const KAKAO_REST_KEY  = '3a6251b3b44aa4f72388859b4771cf4a';
const _geocodeCache   = new Map();
const _travelCache    = new Map();

/**
 * 'HH:MM' 문자열을 자정 기준 분(number)으로 변환한다.
 * @param {string} t - 'HH:MM' 형식 시각
 * @returns {number} 자정 기준 분 (예: '09:30' → 570)
 */
export function timeToMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

/**
 * 분(number)을 'HH:MM' 문자열로 변환한다. 24시간 wrap 및 음수 처리 포함.
 * @param {number} min - 자정 기준 분
 * @returns {string} 'HH:MM' 형식 시각
 */
export function minToTime(min) {
  const total = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// YYYY-MM-DD + days → YYYY-MM-DD
function _offsetDate(dateStr, days) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Kakao Local API로 주소를 좌표(경도·위도)로 변환한다. 결과는 메모리 캐시에 저장된다.
 * @param {string} addr - 검색할 주소 문자열
 * @returns {Promise<{x: number, y: number}|null>} 좌표 객체, 실패 시 null
 */
export async function _geocode(addr) {
  if (!addr?.trim()) return null;
  const key = addr.trim();
  if (_geocodeCache.has(key)) return _geocodeCache.get(key);
  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(key)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` }, cache: 'no-store' }
    );
    const j   = await r.json();
    const doc = j.documents?.[0];
    const val = doc ? { x: parseFloat(doc.x), y: parseFloat(doc.y) } : null;
    _geocodeCache.set(key, val);
    return val;
  } catch { _geocodeCache.set(key, null); return null; }
}

// ISO 8601 → Kakao Future Directions API 출발 시각 형식 (YYYYMMDDHHMM)
// "2026-05-15T07:20:00" → "202605150720"
function _toFutureTime(iso) {
  const [d, t] = iso.split('T');
  const [hh, mm] = (t || '').split(':');
  return `${d.replace(/-/g, '')}${hh || '00'}${mm || '00'}`;
}

/**
 * Kakao Navi API로 두 장소 간 이동 소요 시간(분)을 반환한다. 결과는 메모리 캐시에 저장된다.
 * arrivalTime 지정 시 arrival_time 파라미터를 사용하며, originTime보다 우선 적용된다.
 * @param {string}      placeA      - 출발지 주소
 * @param {string}      placeB      - 도착지 주소
 * @param {string|null} [originTime]  - 출발 시각 ISO 8601 (Future Directions API 사용)
 * @param {string|null} [arrivalTime] - 목표 도착 시각 ISO 8601 (Directions API arrival_time 사용)
 * @returns {Promise<number|null>} 이동 소요 분, 실패 시 null
 */
export async function fetchTravelMin(placeA, placeB, originTime = null, arrivalTime = null) {
  const a = placeA?.trim() || '';
  const b = placeB?.trim() || '';
  if (!a || !b || a === b) return 0;
  if (a === 'Online' || b === 'Online') return 0;
  // Kakao는 ISO 8601을 엄격하게 검증 — 날짜 구분자가 점(.)이면 파라미터를 무시함
  const safeOrigin  = originTime  ? originTime.replace(/\./g, '-')  : null;
  const safeArrival = arrivalTime ? arrivalTime.replace(/\./g, '-') : null;
  // 시각 포함 시 방향 · 시각 모두 캐시 키에 포함 (대칭 키 사용 불가)
  const timeKey = safeArrival ? `ARR:${safeArrival}` : (safeOrigin ? `DEP:${safeOrigin}` : '');
  const cacheKey = timeKey
    ? `${a}|||${b}|||${timeKey}`
    : (a < b ? `${a}|||${b}` : `${b}|||${a}`);
  if (_travelCache.has(cacheKey)) return _travelCache.get(cacheKey);
  try {
    const [orig, dest] = await Promise.all([_geocode(a), _geocode(b)]);
    if (!orig || !dest) { _travelCache.set(cacheKey, null); return null; }

    // 출발 시각 지정 → Future Directions API (/v1/future/directions, YYYYMMDDHHMM 형식)
    // arrival_time 또는 시각 없음 → 일반 Directions API (/v1/directions)
    const coords = `origin=${orig.x},${orig.y}&destination=${dest.x},${dest.y}`;
    const url = safeOrigin
      ? `https://apis-navi.kakaomobility.com/v1/future/directions?${coords}&departure_time=${_toFutureTime(safeOrigin)}`
      : safeArrival
        ? `https://apis-navi.kakaomobility.com/v1/directions?${coords}&priority=TIME&arrival_time=${safeArrival}`
        : `https://apis-navi.kakaomobility.com/v1/directions?${coords}`;

    // cache: 'no-store' — 브라우저 HTTP 캐시가 이전 결과를 반환하는 것을 방지
    const _call = () => fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` }, cache: 'no-store' })
      .then(r => r.json())
      .then(j => { const s = j.routes?.[0]?.summary?.duration; return s != null ? Math.ceil(s / 60) : null; });

    let val = await _call();

    // 오전 출발인데 야간 조회 결과가 40분 미만 → departure_time 무시 의심, 재시도 1회
    if (safeOrigin && val != null) {
      const depHour = parseInt((safeOrigin.split('T')[1] || '12').split(':')[0], 10);
      if (depHour < 10 && new Date().getHours() >= 20 && val < 40) {
        console.warn(
          '[강비서] ⚠️ departure_time 예측 의심 — 오전 %d시 출발이지만 %d분 결과 (현재 %d시). ' +
          '좌표 origin(%s,%s) → dest(%s,%s). 캐시 삭제 후 재시도.',
          depHour, val, new Date().getHours(), orig.x, orig.y, dest.x, dest.y
        );
        _travelCache.delete(cacheKey);
        try { val = (await _call()) ?? val; } catch {}
        console.log('[강비서] departure_time 재시도 결과: %d분', val);
      }
    }

    _travelCache.set(cacheKey, val);
    return val;
  } catch { _travelCache.set(cacheKey, null); return null; }
}

/**
 * 이동 시간 캐시를 강제로 비운다. 날짜 변경 또는 출발지 변경 시 호출한다.
 */
export function clearTravelCache() { _travelCache.clear(); }

// Step 5 Fail-safe: 직선거리 기반 이동 시간 추정 (평균 40 km/h)
async function _fallbackTravelMin(placeA, placeB) {
  try {
    const [o, d] = await Promise.all([_geocode(placeA), _geocode(placeB)]);
    if (!o || !d) return 60;
    const toRad = deg => deg * Math.PI / 180;
    const dLat  = toRad(d.y - o.y);
    const dLng  = toRad(d.x - o.x);
    const a     = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(o.y)) * Math.cos(toRad(d.y)) * Math.sin(dLng / 2) ** 2;
    const km    = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.ceil(km / FALLBACK_SPEED_KMH * 60);
  } catch { return 60; }
}

/**
 * 특정 날짜의 유효 출발지 주소를 반환한다.
 * 우선순위: P1 일별 설정(kangbiseo_daily_origins) → P2 기본 출발지(defaultOriginType) → P3 집 주소.
 * @param {string} date - 'YYYY-MM-DD' 형식 날짜 (일별 설정 조회에 사용)
 * @returns {string} 출발지 주소 문자열, 없으면 빈 문자열
 */
export function resolveOriginAddr(date) {
  let sched = {};
  try {
    const d = JSON.parse(localStorage.getItem('kangbiseo_device') ?? 'null');
    sched = d?.scheduler ?? {};
  } catch {}
  let daily = null;
  try {
    const map = JSON.parse(localStorage.getItem('kangbiseo_daily_origins') ?? 'null');
    daily = (map != null && date && map[date] != null && map[date].type) ? map[date] : null;
  } catch {}
  const origin  = (daily && daily.type) ? daily : { type: sched.defaultOriginType || 'home', customAddr: '' };
  const addrs   = sched.addresses || {};
  if (origin.type === 'custom') return origin.customAddr?.trim() || '';
  const resolved = addrs[origin.type]?.trim() || '';
  return resolved || addrs.home?.trim() || '';
}

// 강의별 준비/마무리 시간이 지정된 경우(> 0)에는 그 값, 아니면 전역 기본값 사용
// 0은 "미지정"으로 처리 — 빈 입력 필드가 0을 반환하므로 전역값으로 폴백
function _effectiveTime(val, globalDefault) {
  return (val != null && val > 0) ? val : (globalDefault || 0);
}

// Firestore 형식(timeStart/timeEnd) 또는 정규화 형식(startTime/endTime) 통일
// targetDate: 다중일 강의에서 어느 날짜 슬라이스인지 판단 (Step 2 경계 로직)
function _normLec(l, targetDate) {
  const startDate  = l.startDate || l.date || '';
  const endDate    = l.endDate   || l.date || '';
  const isMultiDay = !!(startDate && endDate && startDate !== endDate);
  const date       = targetDate  || l.date || startDate;

  let startTime  = l.startTime  != null ? l.startTime  : (l.timeStart != null ? l.timeStart : '');
  let endTime    = l.endTime    != null ? l.endTime    : (l.timeEnd   != null ? l.timeEnd   : '');
  let setupTime  = l.setupTime  != null ? l.setupTime  : 0;
  let wrapupTime = l.wrapupTime != null ? l.wrapupTime : 0;

  // Step 2: 다중일 강의 경계 전용 버퍼 — 절대 시작일에만 준비 시간, 절대 종료일에만 마무리 시간
  if (isMultiDay && date) {
    const isFirstDay = date === startDate;
    const isLastDay  = date === endDate;
    if (!isFirstDay && !isLastDay) {
      // 중간 날짜: 하루 전체 차단, 경계 시간 없음
      startTime = '00:00'; endTime = '23:59'; setupTime = 0; wrapupTime = 0;
    } else if (isFirstDay && !isLastDay) {
      endTime = '23:59'; wrapupTime = 0;   // 마무리는 마지막 날에만
    } else if (!isFirstDay && isLastDay) {
      startTime = '00:00'; setupTime = 0;   // 준비는 첫째 날에만
    }
  } else if (l.isFullDay) {
    startTime = '00:00'; endTime = '23:59'; setupTime = 0; wrapupTime = 0;
  }

  return {
    date,
    startTime,
    endTime,
    place:     l.isOnline ? 'Online' : (l.place != null ? l.place : ''),
    isOnline:  l.isOnline != null ? l.isOnline : false,
    setupTime,
    wrapupTime,
  };
}

// 해당 날 강의 목록에서 startTime~endTime 슬롯이 빈 지 확인
function _isSlotFree(lecs, startTime, endTime, date) {
  const s = timeToMin(startTime), e = timeToMin(endTime);
  return !lecs.some(l => {
    const n = _normLec(l, date);
    return Math.max(s, timeToMin(n.startTime)) < Math.min(e, timeToMin(n.endTime));
  });
}

// 같은 날 빈 슬롯 탐색 — Available Gap >= bMin + D + newDur
function _findSameDaySlots(date, sameDayLecs, newDur, bMin, D) {
  const overhead  = bMin + D;
  const required  = overhead + newDur;
  const DAY_START = timeToMin(SLOT_DAY_START);
  const DAY_END   = timeToMin(SLOT_DAY_END);

  const sorted = [...sameDayLecs]
    .map(l => _normLec(l, date))
    .filter(l => l.startTime && l.endTime)
    .sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));

  const gaps = [];
  let cursor = DAY_START;
  for (const l of sorted) {
    const ls = timeToMin(l.startTime), le = timeToMin(l.endTime);
    if (ls > cursor) gaps.push({ start: cursor, end: ls });
    cursor = Math.max(cursor, le);
  }
  if (cursor < DAY_END) gaps.push({ start: cursor, end: DAY_END });

  return gaps
    .filter(g => (g.end - g.start) >= required)
    .map(g => ({
      date,
      startTime: minToTime(g.start + overhead),
      endTime:   minToTime(g.start + overhead + newDur),
    }));
}

// ── Step 1 helper: 후보 강의와 기존 강의 배열 간 절대 시간 겹침 검사
// @returns {Object|null} 겹치는 기존 강의 객체, 없으면 null
function _checkTimeOverlap(candidateStart, candidateEnd, sorted) {
  for (const ext of sorted) {
    if (candidateStart < ext._e && candidateEnd > ext._s) return ext;
  }
  return null;
}

// ── Step 4 helper: Kakao Navi API로 이동 시간 조회 → 실패 시 직선거리 Fallback
// @returns {Promise<{travelMin:number, isFallback:boolean}>}
async function _resolveTravelMin(from, to, targetDate, targetArrivalMin) {
  const arrivalTimeISO = (targetDate && targetArrivalMin != null)
    ? `${targetDate}T${minToTime(((targetArrivalMin % 1440) + 1440) % 1440)}:00`
    : null;

  let travelMin  = null;
  let isFallback = false;

  try {
    travelMin = await fetchTravelMin(from, to, null, arrivalTimeISO);
  } catch (err) {
    console.warn('[강비서] Kakao API 오류 — Fallback 진입:', err);
  }

  if (travelMin == null) {
    try {
      travelMin  = await _fallbackTravelMin(from, to);
      isFallback = true;
      console.log('[강비서] Fallback 이동 시간 (%s → %s): %d분', from, to, travelMin);
    } catch (err) {
      console.error('[강비서] Fallback 이동 시간 추정 실패 (%s → %s):', from, to, err);
      travelMin  = 60;
      isFallback = true;
    }
  }

  return { travelMin, isFallback };
}

// ── Last-to-Home helper: 강의 종료 후 귀가 시각이 RETURN_LIMIT_MIN 초과인지 검사
// @returns {Promise<{status:'warning'|'safe', ...}>}
async function _checkReturnTime(candidateLecture, wrapupMin, originAddr, targetDate) {
  const { travelMin, isFallback } = await _resolveTravelMin(
    candidateLecture.place, originAddr, targetDate, null
  );

  if (travelMin == null) return { status: 'safe' };

  const returnMin = timeToMin(candidateLecture.endTime) + wrapupMin + travelMin;
  if (returnMin > RETURN_LIMIT_MIN) {
    return {
      status: 'warning', step: 4, msg: 'late_return',
      travelMin, returnMin, isFallback, isHardConflict: false,
    };
  }
  return { status: 'safe' };
}

// 충돌 발생 시 대안 일정 3가지 생성
async function _buildAlternatives(candidateLecture, sameDayLecs, settings, allLectures, D) {
  const globalBuffer  = settings.bufferTime  || DEFAULT_BUFFER_MIN;
  const defaultSetup  = settings.setupTime   || DEFAULT_SETUP_MIN;
  const defaultWrapup = settings.wrapupTime  || DEFAULT_WRAPUP_MIN;
  const newDur        = timeToMin(candidateLecture.endTime) - timeToMin(candidateLecture.startTime);
  const bMin          = defaultWrapup + globalBuffer + _effectiveTime(candidateLecture.setupTime, defaultSetup);

  // Option A: 같은 날 빈 슬롯
  const optionA = _findSameDaySlots(candidateLecture.date, sameDayLecs, newDur, bMin, D);

  // Option B: 전날 / 다음날 — 동일 시간대가 비어 있는지 확인
  const optionB = [];
  for (const delta of [-1, 1]) {
    const d    = _offsetDate(candidateLecture.date, delta);
    const lecs = allLectures.filter(l => (l.date != null ? l.date : '') === d);
    if (_isSlotFree(lecs, candidateLecture.startTime, candidateLecture.endTime, d)) {
      optionB.push({ date: d, startTime: candidateLecture.startTime, endTime: candidateLecture.endTime });
    }
  }

  // Option C: 다음 주 같은 시간대
  const nextWeek = _offsetDate(candidateLecture.date, 7);
  const nwLecs   = allLectures.filter(l => (l.date != null ? l.date : '') === nextWeek);
  const optionC  = _isSlotFree(nwLecs, candidateLecture.startTime, candidateLecture.endTime, nextWeek)
    ? { date: nextWeek, startTime: candidateLecture.startTime, endTime: candidateLecture.endTime }
    : null;

  return { alternatives: { optionA, optionB, optionC } };
}

/**
 * 6단계 스케줄 충돌 검사 엔진. 새 강의와 당일 기존 강의 간 겹침·이동 시간을 검증한다.
 * Step 0: 원격 강의 조기 통과  Step 1: 절대 겹침  Step 2: 버퍼 부족
 * Step 3: 이동 수단 유효성     Step 4: Kakao 이동 시간  Step 5: 동일 장소 예외·Fallback
 * @param {Object}   candidateLecture - 추가할 강의 ({date, startTime, endTime, place, isOnline, ...})
 * @param {Object[]} sameDayLecs  - 같은 날 기존 강의 배열
 * @param {{bufferTime:number, setupTime:number, wrapupTime:number, transport:string, originAddr:string}} settings - 스케줄러 설정
 * @param {Object[]} [allLectures=[]] - 대안 탐색용 전체 강의 배열
 * @returns {Promise<{status:'safe'|'risk'|'warning', step?:number, msg?:string, travelMin?:number, isHardConflict?:boolean, isFallback?:boolean, alternatives?:Object}>}
 */
export async function checkScheduleConflict(candidateLecture, sameDayLecs, settings, allLectures = []) {
  const candStart     = timeToMin(candidateLecture.startTime);
  const candEnd       = timeToMin(candidateLecture.endTime);
  const globalBuffer  = settings.bufferTime  || DEFAULT_BUFFER_MIN;
  const defaultSetup  = settings.setupTime   || DEFAULT_SETUP_MIN;
  const defaultWrapup = settings.wrapupTime  || DEFAULT_WRAPUP_MIN;
  const transport     = settings.transport   || 'car';
  const originAddr    = (settings.originAddr || '').trim();
  const targetDate    = candidateLecture.date || candidateLecture.startDate || '';

  // ── Step 0: Remote Check ──────────────────────────────────────────────────
  // 온라인/원격 강의는 이동 시간 0 — 절대 시간 겹침(Step 1)만 검사 후 통과
  const isRemote = candidateLecture.isOnline === true;

  const sorted = [...sameDayLecs]
    .map(l => { const n = _normLec(l, targetDate); return { ...n, _s: timeToMin(n.startTime), _e: timeToMin(n.endTime) }; })
    .filter(l => l.startTime && l.endTime)
    .sort((a, b) => a._s - b._s);

  // ── Step 1: 절대 시간 겹침 ───────────────────────────────────────────────
  if (_checkTimeOverlap(candStart, candEnd, sorted)) {
    const alts = await _buildAlternatives(candidateLecture, sameDayLecs, settings, allLectures, 0);
    return { status: 'risk', step: 1, msg: 'overlap', travelMin: 0, isHardConflict: true, ...alts };
  }

  // 원격 강의는 겹침 없으면 통과 — 이동 시간 검사 불필요
  if (isRemote) return { status: 'safe', travelMin: 0 };

  // ── Step 3: 이동 수단 유효성 검증 ────────────────────────────────────────
  // (Step 2 다중일 경계 로직은 _normLec 내부에서 처리됨)
  if (transport === 'public') {
    return { status: 'warning', step: 3, msg: 'public_transit', travelMin: null, isHardConflict: false };
  }

  // ── Steps 4 + 5: 이동 검증 + Fail-safe ───────────────────────────────────
  for (const ext of sorted) {
    const isCandFirst = candEnd <= ext._s;
    const prevEnd     = isCandFirst ? candEnd    : ext._e;
    const nextStart   = isCandFirst ? ext._s     : candStart;
    const prevOnline  = isCandFirst ? isRemote   : (ext.isOnline != null ? ext.isOnline : false);
    const nextOnline  = isCandFirst ? (ext.isOnline != null ? ext.isOnline : false) : isRemote;
    const prevPlace   = prevOnline ? 'Online' : (isCandFirst ? (candidateLecture.place || '') : (ext.place || ''));
    const nextPlace   = nextOnline ? 'Online' : (isCandFirst ? (ext.place || '') : (candidateLecture.place || ''));
    const prevWrapup  = isCandFirst
      ? _effectiveTime(candidateLecture.wrapupTime, defaultWrapup)
      : _effectiveTime(ext.wrapupTime, defaultWrapup);
    const nextSetup   = isCandFirst
      ? _effectiveTime(ext.setupTime, defaultSetup)
      : _effectiveTime(candidateLecture.setupTime, defaultSetup);
    const pureGap     = nextStart - prevEnd;

    // 동일 장소 예외 — API 호출 생략
    const samePlace = prevPlace.trim() !== '' && prevPlace.trim() === nextPlace.trim();
    const bMin      = samePlace ? prevWrapup + nextSetup : prevWrapup + globalBuffer + nextSetup;

    // Step 2 (버퍼 부족): API 없이 판단
    if (pureGap < bMin) {
      const alts = await _buildAlternatives(candidateLecture, sameDayLecs, settings, allLectures, 0);
      return { status: 'risk', step: 2, msg: 'buffer', bMin, pureGap, travelMin: 0, isHardConflict: true, ...alts };
    }

    // Step 4: 카카오 Navi API 이동 시간 (목표 도착 시각 기반 라우팅)
    if (!samePlace && prevPlace !== 'Online' && nextPlace !== 'Online') {
      const targetArrivalMin        = nextStart - globalBuffer - nextSetup;
      const { travelMin, isFallback } = await _resolveTravelMin(prevPlace, nextPlace, targetDate, targetArrivalMin);
      const D = travelMin ?? 60;
      if (pureGap < D + bMin) {
        const alts = await _buildAlternatives(candidateLecture, sameDayLecs, settings, allLectures, D);
        return { status: 'risk', step: 4, msg: 'travel', bMin, pureGap, travelMin: D, isFallback, ...alts };
      }
    }
  }

  // ── Step 4 확장: 출발지↔강의 간 이동 시간 검증 ──────────────────────────
  if (originAddr && !isRemote && candidateLecture.place && candidateLecture.place !== 'Online') {

    // Home-to-First: 후보 강의가 당일 첫 일정일 때 출발지→강의 이동 시간 체크
    const isFirstOfDay = sorted.every(ext => ext._s >= candEnd);
    if (isFirstOfDay) {
      const candSetup        = _effectiveTime(candidateLecture.setupTime, defaultSetup);
      const targetArrivalMin = candStart - candSetup;
      const { travelMin: travelFromOrigin, isFallback } =
        await _resolveTravelMin(originAddr, candidateLecture.place, targetDate, Math.max(0, targetArrivalMin));
      if (travelFromOrigin != null) {
        const depMin = targetArrivalMin - travelFromOrigin;
        if (depMin < EARLY_DEP_MIN) {
          return {
            status: 'warning', step: 4, msg: 'early_departure',
            travelMin: travelFromOrigin, depMin, isFallback, isHardConflict: false,
          };
        }
      }
    }

    // Last-to-Home: 후보 강의가 당일 마지막 일정일 때 강의→출발지 귀가 시간 체크
    const isLastOfDay = sorted.every(ext => ext._e <= candStart);
    if (isLastOfDay && originAddr !== candidateLecture.place) {
      const candWrapup = _effectiveTime(candidateLecture.wrapupTime, defaultWrapup);
      const returnResult = await _checkReturnTime(candidateLecture, candWrapup, originAddr, targetDate);
      if (returnResult.status === 'warning') return returnResult;
    }
  }

  return { status: 'safe' };
}

/* ════════════════════════════════════════
   정산 예상 금액 집계
   lectures: Firestore 강의 배열 (allLectures)
   반환값: {
     'YYYY-MM': {
       paid:   { amount: number, count: number },
       unpaid: { amount: number, count: number },
     },
     ...
   }
════════════════════════════════════════ */
export function calculateExpectedSettlement(lectures) {
  // For settlementCycle === 'total': attribute every session's share to the
  // month that contains the group's final session.
  const lastDateByGroup = new Map();
  for (const lec of lectures) {
    if (!lec.groupId || !lec.date) continue;
    const cur = lastDateByGroup.get(lec.groupId);
    if (!cur || lec.date > cur) lastDateByGroup.set(lec.groupId, lec.date);
  }

  const summary = {};

  for (const lec of lectures) {
    if (lec.progressStatus === 'cancelled') continue;
    const feeAmt = lec.feeAmount;
    if (!lec.feeType || !feeAmt || !lec.date) continue;

    let sessionAmount;
    if (lec.feeType === 'unit') {
      sessionAmount = feeAmt;
    } else if (lec.feeType === 'fixed') {
      if (!lec.sessionTotal) continue;
      sessionAmount = Math.round(feeAmt / lec.sessionTotal);
    } else {
      continue;
    }

    // 'total' cycle: push all shares to the month of the last session
    const attributionDate =
      lec.settlementCycle === 'total' && lec.groupId
        ? (lastDateByGroup.get(lec.groupId) != null ? lastDateByGroup.get(lec.groupId) : lec.date)
        : lec.date;

    const month  = attributionDate.slice(0, 7); // 'YYYY-MM'
    const status = lec.isPaid ? 'paid' : 'unpaid';

    if (!summary[month]) {
      summary[month] = {
        paid:   { amount: 0, count: 0 },
        unpaid: { amount: 0, count: 0 },
      };
    }
    summary[month][status].amount += sessionAmount;
    summary[month][status].count  += 1;
  }

  return summary;
}

 /* ════════════════════════════════════════
날짜 + 요일 표시 입력 (Date-with-Day Input)

initDateWithDay(input)
- <input type="date"> 를 투명하게 위에 올리고
- 아래 read-only 텍스트 입력에 YYYY-MM-DD(요) 형식을 표시한다.
- 원본 input의 모든 클래스·속성을 유지하므로 기존 이벤트 위임 / data-* 속성이 그대로 작동한다.

initAllDateWithDay(root?)
- root 안의 input[type="date"].day-input 전체에 위 함수를 적용한다.
- data-ddi-init 속성으로 중복 초기화를 방지한다.
════════════════════════════════════════ */

function _injectDdiStyles() {
if (document.getElementById('ddi-styles')) return;
const s = document.createElement('style');
s.id = 'ddi-styles';
s.textContent = `
.ddi-wrap{position:relative;display:block}
.ddi-display{pointer-events:none!important;user-select:none;color:#1e293b}
.ddi-native{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;opacity:0!important;cursor:pointer!important;z-index:1!important;box-sizing:border-box!important}
`;
document.head.appendChild(s);
}

export function initDateWithDay(input) {
if (!input || input.dataset.ddiInit) return;
input.dataset.ddiInit = '1';
_injectDdiStyles();

// Build display (read-only, visually identical to original)
const display = document.createElement('input');
display.type     = 'text';
display.readOnly = true;
display.className = input.className + ' ddi-display';
display.tabIndex  = -1;
display.setAttribute('aria-hidden', 'true');
display.placeholder = input.placeholder || 'YYYY-MM-DD';

// Wrap original input
const wrap = document.createElement('div');
wrap.className = 'ddi-wrap';
input.parentNode.insertBefore(wrap, input);
wrap.appendChild(display);
wrap.appendChild(input);
input.classList.add('ddi-native');

// Sync helper: formats value → 'YYYY-MM-DD(요)'
const sync = () => {
if (!input.value) { display.value = ''; return; }
const d = new Date(input.value + 'T00:00:00');
display.value = isNaN(d) ? input.value : `${input.value}(${DAY_KO[d.getDay()]})`;
};
sync(); // initialize with any pre-set value
input.addEventListener('change', sync);
}

export function initAllDateWithDay(root = document) {
  root.querySelectorAll('input[type="date"].day-input:not([data-ddi-init])').forEach(initDateWithDay);
}

/* ════════════════════════════════════════
   드롭다운 패널 position:fixed 배치 유틸
   Left edge of panel aligns with left edge of trigger.
   Flips above trigger when there is not enough space below.
════════════════════════════════════════ */
export function positionPanel(triggerEl, panelEl) {
  const rect = triggerEl.getBoundingClientRect();
  const vw   = window.innerWidth;
  const vh   = window.innerHeight;
  const GAP  = 6;

  // Measure actual panel dimensions while invisible (visibility:hidden keeps layout)
  const wasHidden = panelEl.hidden;
  panelEl.style.visibility = 'hidden';
  panelEl.hidden = false;
  const panelW = panelEl.offsetWidth  || 220;
  const panelH = panelEl.offsetHeight || 260;
  if (wasHidden) panelEl.hidden = true;
  panelEl.style.visibility = '';

  panelEl.style.position  = 'fixed';
  panelEl.style.margin    = '0';
  panelEl.style.transform = 'none';
  panelEl.style.right     = 'auto';
  panelEl.style.bottom    = 'auto';
  panelEl.style.width     = '';

  // ── Vertical: prefer downward, flip upward only when there's more room above
  const spaceBelow = vh - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const openDown   = spaceBelow >= panelH || spaceBelow >= spaceAbove;

  panelEl.style.top    = openDown
    ? `${rect.bottom + GAP}px`
    : `${Math.max(GAP, rect.top - panelH - GAP)}px`;
  panelEl.style.bottom = '';

  // Dynamically cap the option list height to available vertical space
  const optList = panelEl.querySelector('.lm-tag-option-list');
  if (optList) {
    const available = Math.max(80, openDown ? spaceBelow : spaceAbove);
    optList.style.maxHeight = `${Math.min(250, Math.max(60, available - 44))}px`;
    optList.style.overflowY = 'auto';
  }

  // ── Horizontal: left-align to trigger, clamp so panel stays inside viewport
  const left = Math.max(GAP, Math.min(rect.left, vw - panelW - GAP));
  panelEl.style.left  = `${left}px`;
  panelEl.style.right = '';
}

/* ════════════════════════════════════════
   강의 모달 HTML 동적 로드 — components/modal.html fetch 후 주입
════════════════════════════════════════ */
export async function loadModal() {
  try {
    const res  = await fetch('../components/modal.html');
    const html = await res.text();
    const tmp  = document.createElement('div');
    tmp.innerHTML = html;
    while (tmp.firstElementChild) {
      document.body.appendChild(tmp.firstElementChild);
    }
  } catch (err) {
    console.error('[강비서] 모달 로드 오류:', err);
  }
}
