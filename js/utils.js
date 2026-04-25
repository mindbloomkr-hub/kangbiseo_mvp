// js/utils.js — 공통 상수 & 유틸리티 (ES Module)
// 모든 페이지 JS에서 이 파일을 import해서 사용한다.
// 새 기능을 만들 때도 공통 로직은 반드시 여기에 먼저 정의할 것.

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
};

export const PROGRESS_LABEL = {
  discussing: '논의 중',
  scheduled:  '강의 예정',
  admin:      '행정 대기',
  done:       '진행 완료',
  cancelled:  '취소/드롭',
};

export const STATUS_META = {
  discussing: { label: '논의 중',   cls: 'lec-badge--discussing' },
  urgent:     { label: '준비 임박', cls: 'lec-badge--urgent'     },
  upcoming:   { label: '강의 예정', cls: 'lec-badge--scheduled'  },
  admin:      { label: '행정 대기', cls: 'lec-badge--admin'      },
  done:       { label: '진행 완료', cls: 'lec-badge--done'       },
  unpaid:     { label: '미입금',    cls: 'lec-badge--unpaid'     },
  cancelled:  { label: '취소',      cls: 'lec-badge--cancelled'  },
};

/* ════════════════════════════════════════
   날짜 유틸
════════════════════════════════════════ */
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/* 항상 { main, day, full } 객체를 반환한다. */
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
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function calcDuration(start, end) {
  if (!start || !end) return '—';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const total = (eh * 60 + em) - (sh * 60 + sm);
  if (total <= 0) return '—';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

/* ════════════════════════════════════════
   강의 상태 자동 분류 (기본)
   calendar.js는 doc 상태가 추가되므로 로컬에서 오버라이드한다.
════════════════════════════════════════ */
export function classifyStatus(lec) {
  const prog = lec.progressStatus || 'scheduled';
  if (prog === 'cancelled')  return 'cancelled';
  if (prog === 'done')       return 'done';
  if (prog === 'admin')      return 'admin';
  if (prog === 'discussing') return 'discussing';

  const d = parseDate(lec.date);
  if (d < TODAY) return lec.isPaid ? 'done' : 'unpaid';
  if (d <= IN_7DAYS) return 'urgent';
  return 'upcoming';
}

/* ════════════════════════════════════════
   시간 선택 (10분 단위 select)
   모달 강의 폼 공통 사용 (af-time-start / af-time-end / af-duration-computed)
════════════════════════════════════════ */
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

export function updateDurationDisplay() {
  const start = document.getElementById('af-time-start')?.value;
  const end   = document.getElementById('af-time-end')?.value;
  const el    = document.getElementById('af-duration-computed');
  if (el) el.value = (start && end) ? calcDuration(start, end) : '';
}

export function syncEndTimeOptions(keepValue = '') {
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (!startSel || !endSel) return;
  const prev = keepValue || endSel.value;
  endSel.innerHTML = buildTimeOptions(startSel.value);
  if (prev) endSel.value = prev;
  updateDurationDisplay();
}

export function initTimeSelects() {
  const startSel = document.getElementById('af-time-start');
  const endSel   = document.getElementById('af-time-end');
  if (startSel) startSel.innerHTML = buildTimeOptions();
  if (endSel)   endSel.innerHTML   = buildTimeOptions();
  startSel?.addEventListener('change', () => syncEndTimeOptions());
  endSel?.addEventListener('change',   updateDurationDisplay);
}

/* ════════════════════════════════════════
   사이드바 유저 정보 공통 업데이트
   id 또는 class 선택자 중 존재하는 요소를 사용한다.
════════════════════════════════════════ */
export function updateSidebarProfile(name) {
  const nameEl   = document.getElementById('sidebar-user-name')  || document.querySelector('.sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-avatar')      || document.querySelector('.sidebar-avatar');
  if (!nameEl || !avatarEl) return;
  nameEl.textContent   = name + ' 강사';
  avatarEl.textContent = name.charAt(0);
}

/* ════════════════════════════════════════
   Toast 알림 공통 래퍼
   'warn'·'info' 타입을 'default'로 정규화한다.
════════════════════════════════════════ */
export function showToast(msg, type = 'default') {
  const map = { success: 'success', error: 'error', warn: 'default', info: 'default' };
  window.showToast?.(msg, map[type] || 'default');
}

/* DOM 값 읽기/쓰기 헬퍼 */
export function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val ?? ''; }
export function getVal(id)       { return document.getElementById(id)?.value ?? ''; }
