// js/utils.js — 공통 상수 & 유틸리티 (ES Module)

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

/* ════════════════════════════════════════
   사이드바 UI 업데이트
════════════════════════════════════════ */
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
