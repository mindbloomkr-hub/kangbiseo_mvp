// js/components/multiSessionModal.js — 연속 강의 일괄 등록

import { db } from '../api.js';
import {
  collection, writeBatch, doc, getDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { buildTimeOptions, initAllDateWithDay, checkScheduleConflict, formatDateKo } from '../utils.js';
import { getTopicTags, registerMsBulkTagUpdate, refreshMsTagPicker, bindMsTagPickerEvents } from './lectureModal.js';

/* ════════════════════════════════════════
   한국 공휴일
════════════════════════════════════════ */
// 고정 양력 공휴일 (MM-DD)
const _SOLAR = new Set([
  '01-01', '03-01', '05-05', '06-06',
  '08-15', '10-03', '10-09', '12-25',
]);

// 음력·대체 공휴일 (연도별 YYYY-MM-DD)
const _LUNAR_RAW = {
  2025: ['2025-01-28','2025-01-29','2025-01-30',
         '2025-05-06',                             // 어린이날 대체
         '2025-10-05','2025-10-06','2025-10-07','2025-10-08'], // 추석+대체
  2026: ['2026-02-16','2026-02-17','2026-02-18',
         '2026-05-25',                             // 부처님오신날
         '2026-09-24','2026-09-25','2026-09-26'],
  2027: ['2027-02-05','2027-02-06','2027-02-07',
         '2027-10-14','2027-10-15','2027-10-16'],
};
const _LUNAR = Object.fromEntries(
  Object.entries(_LUNAR_RAW).map(([y, arr]) => [y, new Set(arr)])
);

export function isKRHoliday(date) {
  const d = date instanceof Date ? date : new Date(date + 'T00:00:00');
  const y    = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return _SOLAR.has(`${mm}-${dd}`) || (_LUNAR[y]?.has(`${y}-${mm}-${dd}`) ?? false);
}

/* ════════════════════════════════════════
   날짜 유틸
════════════════════════════════════════ */
function _fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 공휴일이면 다음 평일로 이동 (연속 공휴일 처리)
function _skipHoliday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  while (isKRHoliday(d)) d.setDate(d.getDate() + 1);
  return _fmt(d);
}

// 요일 한글 한 글자: 0=일 1=월 … 6=토
const _KR_DAYS = ['일','월','화','수','목','금','토'];
function _krDayChar(dateStr) {
  if (!dateStr) return '';
  return _KR_DAYS[new Date(dateStr + 'T00:00:00').getDay()];
}

// N일 뒤 날짜 문자열 (YYYY-MM-DD)
function _offsetDateStr(dateStr, days) {
const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return _fmt(d);
}

// 시작일의 요일에 맞춰 DOW 필 자동 선택 (0=Mon 기준)
function _applyDowFromDate(dateStr) {
  if (!dateStr) return;
  const dow = (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7;
  _selDow = new Set([dow]);
  document.querySelectorAll('.ms-dow-pill').forEach(p =>
  p.classList.toggle('active', parseInt(p.dataset.dow) === dow)
  );
}

/* ════════════════════════════════════════
   일정 생성 엔진
   params {
     startDate: 'YYYY-MM-DD',
     total: number,
     recurrence: 'daily' | 'weekly' | 'monthly',
     dayInterval: number,          // daily
     weekInterval: number,         // weekly
     weekDays: number[],           // weekly  0=Mon…6=Sun
     monthInterval: number,        // monthly
     monthMode: 'same'|'nth'|'specific',
     specificDays: number[],       // monthly-specific  1-31
     skipHolidays: boolean,
   }
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

  /* ── Daily ── */
  if (recurrence === 'daily') {
    const cur = new Date(startDate + 'T00:00:00');
    while (sessions.length < total) {
      push(_fmt(cur));
      cur.setDate(cur.getDate() + dayInterval);
    }

  /* ── Weekly ── */
  } else if (recurrence === 'weekly') {
    if (!weekDays.length) return [];
    const sorted = [...weekDays].sort((a, b) => a - b);
    const start  = new Date(startDate + 'T00:00:00');
    // Monday of start week (0=Mon)
    const dow0   = (start.getDay() + 6) % 7;
    const monday = new Date(start);
    monday.setDate(start.getDate() - dow0);

    let cycle = 0;
    outer: while (true) {
      for (const dow of sorted) {
        if (sessions.length >= total) break outer;
        const c = new Date(monday);
        c.setDate(monday.getDate() + cycle * weekInterval * 7 + dow);
        if (c >= start) push(_fmt(c));
      }
      cycle++;
      if (cycle > 2000) break;
    }

  /* ── Monthly ── */
  } else if (recurrence === 'monthly') {
    const start    = new Date(startDate + 'T00:00:00');
    const startDay = start.getDate();
    const startDow = start.getDay();                       // 0=Sun for nth calc

    // Which Nth occurrence is the start day?
    let nthOccurrence = 0;
    for (let d = 1; d <= startDay; d++) {
      if (new Date(start.getFullYear(), start.getMonth(), d).getDay() === startDow)
        nthOccurrence++;
    }

    // Helper: calendar date of month m (0-based) of year y
    const monthDate = (y, m) => new Date(y, m, 1);

    let cycle = 0;
    while (sessions.length < total) {
      // total months from epoch-month
      const totalM = start.getMonth() + cycle * monthInterval;
      const yr     = start.getFullYear() + Math.floor(totalM / 12);
      const mo     = ((totalM % 12) + 12) % 12;
      const daysInMonth = new Date(yr, mo + 1, 0).getDate();

      if (monthMode === 'same') {
        const day  = Math.min(startDay, daysInMonth);
        const raw  = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        if (raw >= startDate) push(raw);

      } else if (monthMode === 'nth') {
        let count = 0, found = null;
        for (let d = 1; d <= daysInMonth; d++) {
          if (new Date(yr, mo, d).getDay() === startDow) {
            count++;
            if (count === nthOccurrence) { found = d; break; }
          }
        }
        // Fallback: last occurrence of weekday if month is shorter
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
   CSS — <link> 주입 (multiSessionModal.css)
════════════════════════════════════════ */
function _injectStyleLink() {
  if (document.getElementById('ms-style-link')) return;
  const link = document.createElement('link');
  link.id   = 'ms-style-link';
  link.rel  = 'stylesheet';
  link.href = '../css/multiSessionModal.css';
  document.head.appendChild(link);
}

/* ════════════════════════════════════════
   모듈 상태
════════════════════════════════════════ */
let _sessions          = [];   // generated sessions
let _skipHol           = false;
let _isOnline          = false;
let _selDow            = new Set([0]);  // 0=Mon default
let _selDays           = new Set();     // specific month days
let _getCtx            = null;
let _htmlLoaded        = false;
let _msTagId           = null;          // selected topicTagId for ms-modal
// Firestore에서 로드한 스케줄러 기본값 — localStorage 비의존
let _schedulerDefaults = { setupTime: 0, wrapupTime: 0, bufferTime: 30, originAddress: '' };

/* ════════════════════════════════════════
   공개 API
════════════════════════════════════════ */
export function initMultiSessionModal(getCtx) {
  _getCtx = getCtx;
  _injectStyleLink();
}

export async function openMultiSessionModal(startDate) {
  // HTML을 처음 열 때만 fetch → inject → bind
  if (!_htmlLoaded) {
    try {
      const res  = await fetch('../components/multiSessionModal.html');
      const html = await res.text();
      const tmp  = document.createElement('div');
      tmp.innerHTML = html.trim();
      document.body.appendChild(tmp.firstElementChild);
      _bindEvents();
      _htmlLoaded = true;
    } catch (err) {
      console.error('[강비서] 연속 강의 모달 HTML 로드 실패:', err);
      window.showToast?.('모달을 불러오는 데 실패했습니다.', 'error');
      return;
    }
  }

  _reset();
  const bd = document.getElementById('ms-bd');
  requestAnimationFrame(() => bd.classList.add('open'));
  document.body.style.overflow = 'hidden';

  if (startDate) {
    const startEl = document.getElementById('ms-start');
    if (startEl) { startEl.value = startDate; _applyDowFromDate(startDate); }
  }

  const uid = _getCtx?.()?.currentUser?.uid;
  if (uid) _loadSchedulerSettings(uid);

  document.getElementById('ms-title')?.focus();
}

async function _loadSchedulerSettings(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      if (d.setupTime     != null) _schedulerDefaults.setupTime     = Number(d.setupTime);
      if (d.wrapupTime    != null) _schedulerDefaults.wrapupTime    = Number(d.wrapupTime);
      if (d.bufferTime    != null) _schedulerDefaults.bufferTime    = Number(d.bufferTime);
      if (d.originAddress != null) _schedulerDefaults.originAddress = d.originAddress;
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


/* ════════════════════════════════════════
   닫기
════════════════════════════════════════ */
function _close() {
  document.getElementById('ms-bd')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ════════════════════════════════════════
   초기화
════════════════════════════════════════ */
function _reset() {
  _sessions = [];
  _skipHol  = false;
  _isOnline = false;
  _selDow   = new Set([0]);
  _selDays  = new Set();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const $ = id => document.getElementById(id);
  $('ms-title').value   = '';
  $('ms-client').value  = '';
  $('ms-fee').value     = '';
  const onlineCb = $('ms-online');
  if (onlineCb) onlineCb.checked = false;
  const placeEl = $('ms-place');
  if (placeEl) { placeEl.disabled = false; placeEl.value = ''; placeEl.placeholder = '강의장 주소'; }
  $('ms-classroom').value     = '';
  $('ms-parking').value       = '';
  $('ms-setup-time').value    = '';
  $('ms-wrapup-time').value   = '';
  $('ms-buffer-time').value   = '';
  $('ms-participants').value  = '';
  $('ms-group-info').value    = '';
  $('ms-supplies').value      = '';
  $('ms-manager-name').value  = '';
  $('ms-manager-phone').value = '';
  $('ms-manager-email').value = '';
  $('ms-start').value   = today;
  $('ms-total').value   = '';
  $('ms-rec').value     = 'weekly';
  $('ms-week-n').value  = '1';
  $('ms-day-n').value   = '1';
  $('ms-month-n').value = '1';
  $('ms-progress').value = 'scheduled';

  // Time selects
  const tsOpts = buildTimeOptions();
  $('ms-ts').innerHTML = tsOpts;  $('ms-ts').value = '09:00';
  $('ms-te').innerHTML = tsOpts;  $('ms-te').value = '10:00';

  // Holiday toggle
  const tog = $('ms-hol-toggle');
  tog.classList.remove('on'); tog.setAttribute('aria-checked','false');

  // DOW pills
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

  // Hide preview + disable save
  $('ms-preview').style.display = 'none';
  $('ms-save').disabled  = true;
  $('ms-save').textContent = '저장하기';
}

/* ════════════════════════════════════════
   카카오 주소 검색
════════════════════════════════════════ */
function _openKakaoAddress() {
  const load = () => new Promise((resolve, reject) => {
    if (window.daum?.Postcode) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  load().then(() => {
    new daum.Postcode({
      oncomplete(data) {
        const addr = data.roadAddress || data.jibunAddress;
        const el = document.getElementById('ms-place');
        if (el) { el.value = addr; el.focus(); }
      },
    }).open();
  }).catch(() => {
    window.showToast?.('주소 검색 서비스를 불러올 수 없습니다.', 'error');
  });
}


/* ════════════════════════════════════════
   이벤트 바인딩
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

  // Auto-select matching DOW pill when start date is picked
  $('ms-start').addEventListener('change', e => {
    if ($('ms-rec').value === 'weekly') _applyDowFromDate(e.target.value);
  });

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

  // Online toggle
  document.getElementById('ms-online')?.addEventListener('change', e => {
    _isOnline = e.target.checked;
    const placeEl = document.getElementById('ms-place');
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

  // Generate
  $('ms-gen').addEventListener('click', _handleGenerate);

  // Save
  $('ms-save').addEventListener('click', _handleSave);

  // Kakao address search
  $('ms-addr-search')?.addEventListener('click', _openKakaoAddress);

  // Preview table — delegated input sync (single listener, survives re-renders)
  $('ms-tbody').addEventListener('input', e => {
    const inp = e.target.closest('.ms-p-input');
    if (!inp) return;
    const idx   = parseInt(inp.dataset.idx);
    const field = inp.dataset.f;
    if (isNaN(idx) || !field || !_sessions[idx]) return;
    _sessions[idx][field] = inp.value;
    
    // Note: date display (YYYY-MM-DD(요)) is kept in sync by initDateWithDay's
    // 'change' listener on the native input — no manual tag update needed here.
  });

  // Preview table — delegated row add / delete
  $('ms-tbody').addEventListener('click', e => {
    const del = e.target.closest('.ms-row-del');
    if (del) { _deleteRow(parseInt(del.dataset.idx)); return; }
    const add = e.target.closest('.ms-row-add');
    if (add) { _insertRowAfter(parseInt(add.dataset.idx));
    return; }
  });

  // Tag picker — shared logic from lectureModal.js
  registerMsBulkTagUpdate((tagId) => {
    _msTagId = tagId;
    _sessions.forEach(s => { s.topicTagId = tagId; });
    if ($('ms-tbody')) _reRenderTableBody();
  });
  bindMsTagPickerEvents();

}

function _syncRec(val) {
  document.getElementById('ms-opt-daily').style.display= val === 'daily'   ? 'block' : 'none';
  document.getElementById('ms-opt-weekly').style.display= val === 'weekly'  ? 'block' : 'none';
  document.getElementById('ms-opt-monthly').style.display= val === 'monthly' ? 'block' : 'none';
}

/* ════════════════════════════════════════
   미리보기 생성
════════════════════════════════════════ */
function _handleGenerate() {
  const $ = id => document.getElementById(id);
  const startDate = $('ms-start').value;
  const total     = parseInt($('ms-total').value);
  const rec       = $('ms-rec').value;

  if (!startDate)        { window.showToast?.('시작일을 선택하세요.', 'warn'); return; }
  if (!total || total < 1) { window.showToast?.('총 회차 수를 입력하세요.', 'warn'); return; }
  if (total > 200)       { window.showToast?.('최대 200회차까지 지원합니다.', 'warn'); return; }

  const monthMode = document.querySelector('input[name="ms-mm"]:checked')?.value ?? 'same';

  if (rec === 'weekly' && _selDow.size === 0) {
    window.showToast?.('요일을 하나 이상 선택하세요.', 'warn'); return;
  }
  if (rec === 'monthly' && monthMode === 'specific' && _selDays.size === 0) {
    window.showToast?.('날짜를 하나 이상 선택하세요.', 'warn'); return;
  }

  _sessions = generateSessions({
    startDate,
    total,
    recurrence:   rec,
    dayInterval:  parseInt($('ms-day-n').value)   || 1,
    weekInterval: parseInt($('ms-week-n').value)  || 1,
    weekDays:     [..._selDow],
    monthInterval:parseInt($('ms-month-n').value) || 1,
    monthMode,
    specificDays: [..._selDays],
    skipHolidays: _skipHol,
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

  // Initialize missing fields only — preserves edits across re-renders
  _sessions.forEach(s => {
    if (s.timeStart === undefined) s.timeStart = defStart;
    if (s.timeEnd   === undefined) s.timeEnd   = defEnd;
    if (s.topic     === undefined) s.topic     = '';
  });

    _reRenderTableBody();
    $('ms-preview').style.display = '';
    $('ms-save').disabled  = false;
    $('ms-save').textContent = `저장하기 (${_sessions.length}회차)`;
    $('ms-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Pure DOM update — called by _renderPreview and all CRUD operations
  function _reRenderTableBody() {
  const $ = id => document.getElementById(id);

  const hasShifted = _sessions.some(s => s.wasShifted);
  $('ms-hbadge').style.display  = hasShifted ? '' : 'none';
  $('ms-obadge').style.display  = _isOnline  ? '' : 'none';
  $('ms-pcount').textContent    = `${_sessions.length}회차 생성됨`;
  $('ms-save').textContent      = `저장하기 (${_sessions.length}회차)`;

  $('ms-tbody').innerHTML = _sessions.map((s, i) => {
    const shifted  = s.wasShifted;
    const tip      = shifted ? `title="원래 날짜: ${s.originalDate} (공휴일)"` : '';
    const tagColor = s.topicTagId != null
      ? (getTopicTags().find(t => t.id === s.topicTagId)?.color ?? '#e5e7eb')
      : '#e5e7eb';

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
  // Apply date+day overlay to every freshly rendered date input
  initAllDateWithDay(document.getElementById('ms-tbody'));
}

function _resequence() {
  _sessions.forEach((s, i) => { s.sessionCurrent = i + 1;
  });
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
    date:         newDate,
    timeStart:    ref.timeStart,
    timeEnd:      ref.timeEnd,
    topic:        '',
    wasShifted:   false,
    originalDate: newDate,
    sessionCurrent: 0, // _resequence will set this
  });
  _resequence();
  _reRenderTableBody();
}

/* ════════════════════════════════════════
   충돌 검사 유틸
════════════════════════════════════════ */
function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _tMin(t) {
  const [h = 0, m = 0] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function _findConflictLec(newLec, sameDayRaw, check) {
  if (!sameDayRaw.length) return null;
  const nS = _tMin(newLec.startTime);
  const nE = _tMin(newLec.endTime);
  const lf = (l, w) => w === 's'
    ? (l.startTime ?? l.timeStart ?? '')
    : (l.endTime   ?? l.timeEnd   ?? '');
  if (check.step === 1) {
    return sameDayRaw.find(l => {
      const s = _tMin(lf(l,'s')), e = _tMin(lf(l,'e'));
      return Math.max(nS, s) < Math.min(nE, e);
    }) ?? sameDayRaw[0];
  }
  return sameDayRaw.reduce((best, l) => {
    const s  = _tMin(lf(l,'s')),    e  = _tMin(lf(l,'e'));
    const bs = _tMin(lf(best,'s')), be = _tMin(lf(best,'e'));
    const dist     = nS >= e  ? nS - e  : s  - nE;
    const bestDist = nS >= be ? nS - be : bs - nE;
    return Math.abs(dist) < Math.abs(bestDist) ? l : best;
  }, sameDayRaw[0]);
}

/* ════════════════════════════════════════
   Firestore 배치 저장 (공용)
════════════════════════════════════════ */
async function _commitBatch(commonData, sessionTotal) {
  const saveBtn = document.getElementById('ms-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
  try {
    const batch = writeBatch(db);
    for (const s of _sessions) {
      const ref = doc(collection(db, 'lectures'));
      batch.set(ref, {
        ...commonData,
        date:              s.date,
        timeStart:         s.timeStart || '',
        timeEnd:           s.timeEnd   || '',
        topic:             s.topic     || '',
        sessionCurrent:    s.sessionCurrent,
        wasHolidayShifted: s.wasShifted ?? false,
        createdAt:         serverTimestamp(),
      });
    }
    await batch.commit();
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
  document.getElementById('ms-cf-backdrop')?.remove();

  const stepLabel = check.step === 1
    ? '시간이 직접 겹칩니다'
    : check.step === 2
    ? '버퍼 시간이 부족합니다'
    : '이동 시간 포함 시 도착이 늦습니다';

  const { full: dateFull } = formatDateKo(session.date);
  const cTitle  = conflictLec?.title  || '(제목 없음)';
  const cClient = conflictLec?.client || '—';
  const cPlace  = conflictLec?.isOnline ? '💻 온라인 수업' : (conflictLec?.place || '—');
  const cStart  = conflictLec?.startTime ?? conflictLec?.timeStart ?? '?';
  const cEnd    = conflictLec?.endTime   ?? conflictLec?.timeEnd   ?? '?';

  const bd = document.createElement('div');
  bd.id        = 'ms-cf-backdrop';
  bd.className = 'ms-cf-bd';
  bd.setAttribute('role', 'dialog');
  bd.setAttribute('aria-modal', 'true');
  bd.innerHTML = `
    <div class="ms-cf-modal">
      <div class="ms-cf-head">
        <div>
          <p class="ms-cf-title">⚠️ 일정 충돌 감지</p>
          <p class="ms-cf-sub">${_esc(stepLabel)}</p>
        </div>
        <button class="ms-cf-x" id="ms-cf-x" aria-label="닫기">✕</button>
      </div>
      <div class="ms-cf-body">
        <p class="ms-cf-section-label">충돌 발생 세션</p>
        <div class="ms-cf-card ms-cf-card--new">
          <span class="ms-cf-badge">${session.sessionCurrent}회차</span>
          <p class="ms-cf-date">${_esc(dateFull)}</p>
          <p class="ms-cf-time">${_esc(session.timeStart || '?')} ~ ${_esc(session.timeEnd || '?')}</p>
          <p class="ms-cf-place">📍 ${_esc(common.place || '—')}</p>
        </div>
        <p class="ms-cf-vs">VS</p>
        <p class="ms-cf-section-label">기존 강의</p>
        <div class="ms-cf-card ms-cf-card--ext">
          <p class="ms-cf-lec-title">${_esc(cTitle)}</p>
          <p class="ms-cf-time">${_esc(cStart)} ~ ${_esc(cEnd)}</p>
          <p class="ms-cf-client">🏢 ${_esc(cClient)}</p>
          <p class="ms-cf-place">📍 ${_esc(cPlace)}</p>
        </div>
      </div>
      <div class="ms-cf-foot">
        <button class="ms-cf-btn ms-cf-btn--back" id="ms-cf-back">← 수정하기</button>
        <button class="ms-cf-btn ms-cf-btn--pending" id="ms-cf-pending">보류로 저장</button>
      </div>
    </div>`;

  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('open'));

  const close = () => {
    bd.classList.remove('open');
    setTimeout(() => bd.remove(), 200);
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
  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중...';

  // Flush any pending DOM edits (belt-and-suspenders)
  $('ms-tbody').querySelectorAll('.ms-p-input').forEach(inp => {
    const idx   = parseInt(inp.dataset.idx);
    const field = inp.dataset.f;
    if (isNaN(idx) || !field || !_sessions[idx]) return;
    _sessions[idx][field] = inp.value;
  });

  const _restoreBtn = () => {
    saveBtn.disabled = false;
    saveBtn.textContent = `저장하기 (${_sessions.length}회차)`;
  };

  // ── Required field validation ──────────────────────
  const title = $('ms-title').value.trim();
  if (!title) { window.showToast?.('강의명을 입력하세요.', 'warn'); _restoreBtn(); return; }

  const client = $('ms-client').value.trim();
  if (!client) { window.showToast?.('고객사를 입력하세요.', 'warn'); _restoreBtn(); return; }

  const place = $('ms-place').value.trim();
  if (!place) { window.showToast?.('강의장 주소를 입력하세요.', 'warn'); _restoreBtn(); return; }

  const groupId      = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sessionTotal = _sessions.length;
  const common = {
    uid:             currentUser.uid,
    groupId,
    title,
    client,
    place,
    fee:             Number($('ms-fee').value) || 0,
    progressStatus:  $('ms-progress').value || 'scheduled',
    topicTagId:      _msTagId,
    sessionTotal,
    isPaid:          false,
    isDocumented:    false,
    classroom:       $('ms-classroom').value.trim(),
    parking:         $('ms-parking').value.trim(),
    setupTime:       $('ms-setup-time').value.trim(),
    wrapupTime:      $('ms-wrapup-time').value.trim(),
    participants:    Number($('ms-participants').value) || 0,
    groupInfo:       $('ms-group-info').value.trim(),
    supplies:        $('ms-supplies').value.trim(),
    managerName:     $('ms-manager-name').value.trim(),
    managerPhone:    $('ms-manager-phone').value.trim(),
    managerEmail:    $('ms-manager-email').value.trim(),
  };

  // ── Conflict validation loop ───────────────────────
  const { allLectures = [] } = ctx;
  const setupMin    = parseInt(common.setupTime)  || 0;
  const wrapupMin   = parseInt(common.wrapupTime) || 0;
  const bufferInput = parseInt(document.getElementById('ms-buffer-time')?.value);
  const settings    = {
    bufferTime: (!isNaN(bufferInput) && bufferInput > 0)
      ? bufferInput
      : _schedulerDefaults.bufferTime,
    setupTime:  setupMin,
    wrapupTime: wrapupMin,
  };

  for (let i = 0; i < _sessions.length; i++) {
    const s = _sessions[i];
    saveBtn.textContent = `충돌 검사 중… (${i + 1}/${sessionTotal})`;

    const sameDayRaw   = allLectures.filter(l => l.date === s.date);
    const existingLecs = sameDayRaw.map(l => ({
      date:       l.date,
      startTime:  l.startTime  ?? l.timeStart  ?? '',
      endTime:    l.endTime    ?? l.timeEnd    ?? '',
      place:      l.isOnline ? 'Online' : (l.place ?? ''),
      isOnline:   l.isOnline   ?? false,
      setupTime:  l.setupTime  ?? 0,
      wrapupTime: l.wrapupTime ?? 0,
    }));

    const newLec = {
      date:       s.date,
      startTime:  s.timeStart || '',
      endTime:    s.timeEnd   || '',
      place:      _isOnline ? 'Online' : place,
      isOnline:   _isOnline,
      setupTime:  setupMin,
      wrapupTime: wrapupMin,
    };
    console.log(`[Session ${i + 1}/${sessionTotal}] newLec:`, newLec, '| sameDayRaw count:', sameDayRaw.length);

    let check;
    try {
      check = await checkScheduleConflict(newLec, existingLecs, settings, allLectures);
    } catch (err) {
      console.error('[강비서] 충돌 검사 오류:', err);
      window.showToast?.('일정 충돌 검사 중 오류가 발생했습니다.', 'error');
      _restoreBtn();
      return;
    }

    console.log(`[Session Check] Date: ${s.date}, Status: ${check.status}`, check);

    if (check.status !== 'safe') {
      const conflictLec = _findConflictLec(newLec, sameDayRaw, check);
      _restoreBtn();
      _openConflictModal({ session: s, check, conflictLec, common, sessionTotal });
      return;
    }
  }

  // ── All clear — commit ─────────────────────────────
  await _commitBatch(common, sessionTotal);
}
