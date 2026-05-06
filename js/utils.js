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
  done:       '진행 완료',
  onhold:     '보류 중',
  cancelled:  '취소/드롭',
  needs_review: '확인 필요',
};

export const STATUS_META = {
  discussing:   { label: '💬 논의 중',    cls: 'lec-badge--discussing'  },
  scheduled:    { label: '📅 강의 예정',  cls: 'lec-badge--scheduled'   },
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

  // Priority 1: cancelled always wins
  if (prog === 'cancelled') return 'cancelled';

  const d = parseDate(lec.date);

  // Priority 2: unpaid alert — past date OR done status, AND not yet paid
  if (!lec.isPaid && (d < TODAY || prog === 'done')) return 'unpaid';

  // Priority 3: urgent alert — confirmed scheduled lecture within 7 days
  if (prog === 'scheduled' && d >= TODAY && d <= IN_7DAYS) return 'urgent';

  // Remaining: return actual progress status (discussing | scheduled | done | onhold)
  return prog;
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
   일정 충돌 검사 — 3단계 엔진 + 대안 제안
════════════════════════════════════════ */

const KAKAO_REST_KEY  = '3a6251b3b44aa4f72388859b4771cf4a';
const _geocodeCache   = new Map();
const _travelCache    = new Map();

// "HH:MM" → 분(number)
function timeToMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

// 분(number) → "HH:MM"
function _minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// YYYY-MM-DD + days → YYYY-MM-DD
function _offsetDate(dateStr, days) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Kakao Local API: 주소 → { x(lng), y(lat) }
export async function _geocode(addr) {
  if (!addr?.trim()) return null;
  const key = addr.trim();
  if (_geocodeCache.has(key)) return _geocodeCache.get(key);
  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(key)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    const j   = await r.json();
    const doc = j.documents?.[0];
    const val = doc ? { x: parseFloat(doc.x), y: parseFloat(doc.y) } : null;
    _geocodeCache.set(key, val);
    return val;
  } catch { _geocodeCache.set(key, null); return null; }
}

// Kakao Navi API: 두 장소 간 이동 소요 시간(분), 실패 시 null
// originTime: ISO 8601 출발 시각 (예: "2026-05-06T09:30:00"). 미지정 시 시간 무관 탐색.
export async function fetchTravelMin(placeA, placeB, originTime = null) {
  const a = placeA?.trim() || '';
  const b = placeB?.trim() || '';
  if (!a || !b || a === b) return 0;
  if (a === 'Online' || b === 'Online') return 0;
  // originTime 포함 시 방향 · 시각 모두 캐시 키에 포함 (대칭 키 사용 불가)
  const cacheKey = originTime
    ? `${a}|||${b}|||${originTime}`
    : (a < b ? `${a}|||${b}` : `${b}|||${a}`);
  if (_travelCache.has(cacheKey)) return _travelCache.get(cacheKey);
  try {
    const [orig, dest] = await Promise.all([_geocode(a), _geocode(b)]);
    if (!orig || !dest) { _travelCache.set(cacheKey, null); return null; }
    let url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${orig.x},${orig.y}&destination=${dest.x},${dest.y}`;
    if (originTime) url += `&priority=TIME&origin_time=${encodeURIComponent(originTime)}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } });
    const j    = await r.json();
    const secs = j.routes?.[0]?.summary?.duration;
    const val  = secs != null ? Math.ceil(secs / 60) : null;
    _travelCache.set(cacheKey, val);
    return val;
  } catch { _travelCache.set(cacheKey, null); return null; }
}

// Firestore 형식(timeStart/timeEnd) 또는 정규화 형식(startTime/endTime) 통일
function _normLec(l) {
  return {
    date:       l.date       ?? '',
    startTime:  l.startTime  ?? l.timeStart  ?? '',
    endTime:    l.endTime    ?? l.timeEnd    ?? '',
    place:      l.isOnline ? 'Online' : (l.place ?? ''),
    isOnline:   l.isOnline   ?? false,
    setupTime:  l.setupTime  ?? 0,
    wrapupTime: l.wrapupTime ?? 0,
  };
}

// 해당 날 강의 목록에서 startTime~endTime 슬롯이 빈 지 확인
function _isSlotFree(lecs, startTime, endTime) {
  const s = timeToMin(startTime), e = timeToMin(endTime);
  return !lecs.some(l => {
    const n = _normLec(l);
    return Math.max(s, timeToMin(n.startTime)) < Math.min(e, timeToMin(n.endTime));
  });
}

// 같은 날 빈 슬롯 탐색 — Available Gap >= bMin + D + newDur
function _findSameDaySlots(date, sameDayLecs, newDur, bMin, D) {
  const overhead  = bMin + D;
  const required  = overhead + newDur;
  const DAY_START = timeToMin('07:00');
  const DAY_END   = timeToMin('22:00');

  const sorted = [...sameDayLecs]
    .map(_normLec)
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
      startTime: _minToTime(g.start + overhead),
      endTime:   _minToTime(g.start + overhead + newDur),
    }));
}

// 충돌 발생 시 대안 일정 3가지 생성
async function _buildAlternatives(newLec, sameDayLecs, settings, allLectures, D) {
  const globalBuffer  = settings.bufferTime  || 30;
  const defaultSetup  = settings.setupTime   || 0;
  const defaultWrapup = settings.wrapupTime  || 0;
  const newDur        = timeToMin(newLec.endTime) - timeToMin(newLec.startTime);
  const bMin          = defaultWrapup + globalBuffer + (newLec.setupTime ?? defaultSetup);

  // Option A: 같은 날 빈 슬롯
  const optionA = _findSameDaySlots(newLec.date, sameDayLecs, newDur, bMin, D);

  // Option B: 전날 / 다음날 — 동일 시간대가 비어 있는지 확인
  const optionB = [];
  for (const delta of [-1, 1]) {
    const d    = _offsetDate(newLec.date, delta);
    const lecs = allLectures.filter(l => (l.date ?? '') === d);
    if (_isSlotFree(lecs, newLec.startTime, newLec.endTime)) {
      optionB.push({ date: d, startTime: newLec.startTime, endTime: newLec.endTime });
    }
  }

  // Option C: 다음 주 같은 시간대
  const nextWeek = _offsetDate(newLec.date, 7);
  const nwLecs   = allLectures.filter(l => (l.date ?? '') === nextWeek);
  const optionC  = _isSlotFree(nwLecs, newLec.startTime, newLec.endTime)
    ? { date: nextWeek, startTime: newLec.startTime, endTime: newLec.endTime }
    : null;

  return { alternatives: { optionA, optionB, optionC } };
}

/* ─── 공개 API ─────────────────────────────────────────── */
export async function checkScheduleConflict(newLec, sameDayLecs, settings, allLectures = []) {
  const newStart      = timeToMin(newLec.startTime);
  const newEnd        = timeToMin(newLec.endTime);
  const globalBuffer  = settings.bufferTime  || 30;
  const defaultSetup  = settings.setupTime   || 0;
  const defaultWrapup = settings.wrapupTime  || 0;

  const sorted = [...sameDayLecs]
    .map(l => ({ ...l, _s: timeToMin(l.startTime), _e: timeToMin(l.endTime) }))
    .sort((a, b) => a._s - b._s);

  for (const ext of sorted) {
    // ── Step 1: 직접 겹침 ──────────────────────────────
    if (Math.max(newStart, ext._s) < Math.min(newEnd, ext._e)) {
      const alts = await _buildAlternatives(newLec, sameDayLecs, settings, allLectures, 0);
      return { status: 'risk', step: 1, msg: 'overlap', travelMin: 0, isHardConflict: true, ...alts };
    }

    // prev / next 판별
    const isPrevNew     = newEnd <= ext._s;
    const prevEnd       = isPrevNew ? newEnd   : ext._e;
    const nextStart     = isPrevNew ? ext._s   : newStart;
    const prevOnline    = isPrevNew ? (newLec.isOnline ?? false) : (ext.isOnline ?? false);
    const nextOnline    = isPrevNew ? (ext.isOnline ?? false)    : (newLec.isOnline ?? false);
    const prevPlace     = prevOnline ? 'Online' : (isPrevNew ? newLec.place : ext.place);
    const nextPlace     = nextOnline ? 'Online' : (isPrevNew ? ext.place    : newLec.place);
    const prevWrapup    = isPrevNew ? (newLec.wrapupTime ?? defaultWrapup) : (ext.wrapupTime ?? defaultWrapup);
    const nextSetup     = isPrevNew ? (ext.setupTime  ?? defaultSetup)     : (newLec.setupTime ?? defaultSetup);
    const pureGap       = nextStart - prevEnd;

    const samePlace = prevPlace?.trim() !== '' && prevPlace?.trim() === nextPlace?.trim();
    const bMin      = samePlace
      ? prevWrapup + nextSetup
      : prevWrapup + globalBuffer + nextSetup;

    // ── Step 2: Pure Gap < B_min (API 없이 판단) ───────
    if (pureGap < bMin) {
      const alts = await _buildAlternatives(newLec, sameDayLecs, settings, allLectures, 0);
      return { status: 'risk', step: 2, msg: 'buffer', bMin, pureGap, travelMin: 0, isHardConflict: true, ...alts };
    }

    // ── Step 3: API 이동시간 포함 재판단 (origin_time 적용) ───────────────
    const depMinOfDay = (prevEnd + prevWrapup) % 1440;
    const originTime  = newLec.date ? `${newLec.date}T${_minToTime(depMinOfDay)}:00` : null;
    const travelMin   = await fetchTravelMin(prevPlace, nextPlace, originTime);
    const D           = travelMin ?? 60;
    if (pureGap < D + bMin) {
      const alts = await _buildAlternatives(newLec, sameDayLecs, settings, allLectures, D);
      return { status: 'risk', step: 3, msg: 'travel', bMin, pureGap, travelMin: D, ...alts };
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
    if (!lec.feeType || !lec.feeAmount || !lec.date) continue;

    let sessionAmount;
    if (lec.feeType === 'unit') {
      sessionAmount = lec.feeAmount;
    } else if (lec.feeType === 'fixed') {
      if (!lec.sessionTotal) continue; // can't divide without a total
      sessionAmount = Math.round(lec.feeAmount / lec.sessionTotal);
    } else {
      continue;
    }

    // 'total' cycle: push all shares to the month of the last session
    const attributionDate =
      lec.settlementCycle === 'total' && lec.groupId
        ? (lastDateByGroup.get(lec.groupId) ?? lec.date)
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
