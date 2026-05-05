// js/components/multiSessionModal.js — 연속 강의 일괄 등록

import { db } from '../api.js';
import {
  collection, writeBatch, doc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { buildTimeOptions, initAllDateWithDay } from '../utils.js';

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
   CSS 주입
════════════════════════════════════════ */
function _injectStyles() {
  if (document.getElementById('ms-styles')) return;
  const s = document.createElement('style');
  s.id = 'ms-styles';
  s.textContent = `
/* backdrop */
.ms-bd{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .2s}
.ms-bd.open{opacity:1;pointer-events:auto}

/* modal shell */
.ms-modal{background:#fff;border-radius:20px;width:100%;max-width:660px;max-height:90vh;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.25);display:flex;flex-direction:column;box-sizing:border-box}

/* header */
.ms-head{background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:18px 22px;border-radius:20px 20px 0 0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.ms-head-title{color:#fff;font-size:17px;font-weight:800;margin:0}
.ms-head-sub{color:rgba(255,255,255,.75);font-size:12px;margin-top:3px}
.ms-x{background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:2px 8px;border-radius:6px;line-height:1;transition:all .15s}
.ms-x:hover{color:#fff;background:rgba(255,255,255,.18)}

/* body */
.ms-body{padding:22px;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden}
.ms-section{margin-bottom:22px}
.ms-section-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;padding-bottom:6px;border-bottom:1.5px solid #f1f5f9}

/* grid */
.ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ms-field{display:flex;flex-direction:column;gap:4px}
.ms-field--full{grid-column:1/-1}
.ms-label{font-size:12px;font-weight:700;color:#475569}

/* inputs */
.ms-input,.ms-select{width:100%;height:38px;border:1.5px solid #e2e8f0;border-radius:9px;padding:0 12px;font-size:14px;color:#1e293b;background:#f8fafc;outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}
.ms-input:focus,.ms-select:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12);background:#fff}
.ms-input::placeholder{color:#cbd5e1}

/* DOW pills */
.ms-dow-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.ms-dow-pill{min-width:36px;height:36px;border:1.5px solid #e2e8f0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;cursor:pointer;background:#f8fafc;color:#64748b;transition:all .15s;user-select:none}
.ms-dow-pill.active{background:#2563eb;border-color:#2563eb;color:#fff}

/* specific day grid */
.ms-day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:8px}
.ms-day-chip{height:30px;border:1.5px solid #e2e8f0;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;cursor:pointer;background:#f8fafc;color:#475569;transition:all .15s;user-select:none}
.ms-day-chip.active{background:#7c3aed;border-color:#7c3aed;color:#fff}

/* toggle */
.ms-toggle-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#eff6ff;border-radius:11px;border:1.5px solid #bfdbfe;margin-top:14px}
.ms-toggle-label{font-size:13px;font-weight:700;color:#1e40af;flex:1}
.ms-toggle-sub{font-size:11px;color:#3b82f6;display:block;margin-top:2px}
.ms-toggle{width:44px;height:24px;border-radius:12px;background:#cbd5e1;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;outline:none;padding:0}
.ms-toggle::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.ms-toggle.on{background:#2563eb}
.ms-toggle.on::after{transform:translateX(20px)}

/* generate button */
.ms-gen-btn{width:100%;height:46px;background:linear-gradient(90deg,#2563eb,#7c3aed);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;margin-top:6px;transition:opacity .15s;letter-spacing:.02em}
.ms-gen-btn:hover{opacity:.88}
.ms-gen-btn:disabled{opacity:.42;cursor:not-allowed}

/* divider */
.ms-divider{border:none;border-top:2px dashed #e2e8f0;margin:22px 0 18px}

/* preview */
.ms-preview-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.ms-preview-count{font-size:14px;font-weight:800;color:#1e293b}
.ms-holiday-badge{font-size:11px;font-weight:700;color:#d97706;background:#fffbeb;border:1px solid #fde68a;padding:4px 10px;border-radius:20px}
.ms-preview-wrap{overflow-x:auto;border:1.5px solid #e2e8f0;border-radius:12px}
.ms-preview-table{width:100%;border-collapse:collapse;font-size:13px}
.ms-preview-table th{font-size:11px;font-weight:700;color:#64748b;text-align:left;padding:8px 10px;background:#f8fafc;white-space:nowrap}
.ms-preview-table th:first-child{border-radius:10px 0 0 0}
.ms-preview-table th:last-child{border-radius:0 10px 0 0}
.ms-preview-table td{padding:6px 8px;border-top:1px solid #f1f5f9;vertical-align:middle}
.ms-preview-table tr.row-shifted{background:#fffbeb}
.ms-preview-table tr:hover:not(.row-shifted){background:#f8fafc}
.ms-seq{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:800;flex-shrink:0}
.ms-seq.shifted{background:#fde68a;color:#92400e}
.ms-p-input{width:100%;height:30px;border:1.5px solid #e2e8f0;border-radius:7px;padding:0 8px;font-size:12px;color:#1e293b;background:#fff;outline:none;box-sizing:border-box;transition:border-color .15s}
.ms-p-input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.1)}
.ms-p-date{width:128px}
.ms-p-time{width:72px}

/* radio group */
.ms-radio-group{display:flex;flex-direction:column;gap:8px}
.ms-radio-label{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#1e293b;cursor:pointer;padding:9px 13px;border:1.5px solid #e2e8f0;border-radius:10px;transition:all .15s;line-height:1.4}
.ms-radio-label:has(input:checked){border-color:#2563eb;background:#eff6ff;color:#1e40af}
.ms-radio-label input{accent-color:#2563eb;flex-shrink:0;margin-top:2px}

/* footer */
.ms-foot{padding:16px 22px;border-top:1px solid #f1f5f9;display:flex;gap:10px;flex-shrink:0;background:#fff;border-radius:0 0 20px 20px}
.ms-foot-btn{flex:1;padding:13px;border-radius:11px;font-size:14px;font-weight:800;border:none;cursor:pointer;transition:all .15s}
.ms-foot-btn:disabled{opacity:.4;cursor:not-allowed}
.ms-foot-btn--cancel{background:#f1f5f9;color:#475569}
.ms-foot-btn--cancel:hover:not(:disabled){background:#e2e8f0}
.ms-foot-btn--save{background:#2563eb;color:#fff}
.ms-foot-btn--save:hover:not(:disabled){background:#1d4ed8}

/* recurrence sub-panel */
.ms-sub{padding:14px;background:#f8fafc;border-radius:12px;border:1.5px solid #e2e8f0;margin-top:12px}

@media(max-width:540px){
  .ms-grid{grid-template-columns:1fr}
  .ms-day-grid{grid-template-columns:repeat(7,1fr)}
}

/* row action buttons */
.ms-td-actions{white-space:nowrap;text-align:center;padding:4px 6px!important;vertical-align:middle}
.ms-row-btn{width:22px;height:22px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;padding:0;line-height:1;margin:0 1px}
.ms-row-del{background:#fee2e2;color:#dc2626}.ms-row-del:hover{background:#fca5a5}
.ms-row-add{background:#dcfce7;color:#16a34a}.ms-row-add:hover{background:#86efac}
/* Korean day tag */
.ms-dow-tag{font-size:11px;font-weight:700;color:#94a3b8;white-space:nowrap;flex-shrink:0;min-width:20px}
.ms-td-date{white-space:nowrap}
.ms-preview-table th.th-act{width:60px;text-align:center}

  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════
   Modal HTML
════════════════════════════════════════ */
const _DOW = ['월','화','수','목','금','토','일'];

function _html() {
  const dowPills = _DOW.map((l, i) =>
    `<div class="ms-dow-pill${i===0?' active':''}" data-dow="${i}">${l}</div>`
  ).join('');
  const dayChips = Array.from({length:31}, (_,i) =>
    `<div class="ms-day-chip" data-day="${i+1}">${i+1}</div>`
  ).join('');

  return `
<div class="ms-bd" id="ms-bd" role="dialog" aria-modal="true" aria-label="연속 강의 일괄 등록">
  <div class="ms-modal">

    <div class="ms-head">
      <div>
        <p class="ms-head-title">📅 연속 강의 일괄 등록</p>
        <p class="ms-head-sub">반복 일정을 자동 생성하고 한 번에 저장하세요.</p>
      </div>
      <button class="ms-x" id="ms-x" aria-label="닫기">✕</button>
    </div>

    <div class="ms-body">

      <!-- ① 공통 강의 정보 -->
      <div class="ms-section">
        <p class="ms-section-title">공통 강의 정보</p>
        <div class="ms-grid">
          <div class="ms-field ms-field--full">
            <label class="ms-label" for="ms-title">강의명 *</label>
            <input class="ms-input" type="text" id="ms-title" placeholder="예) Python 기초 과정 1기" />
          </div>
          <div class="ms-field">
            <label class="ms-label" for="ms-client">고객사</label>
            <input class="ms-input" type="text" id="ms-client" placeholder="고객사명" />
          </div>
          <div class="ms-field">
            <label class="ms-label" for="ms-place">강의 장소</label>
            <input class="ms-input" type="text" id="ms-place" placeholder="강의장 주소" />
          </div>
          <div class="ms-field">
            <label class="ms-label" for="ms-ts">시작 시간 *</label>
            <select class="ms-select" id="ms-ts"></select>
          </div>
          <div class="ms-field">
            <label class="ms-label" for="ms-te">종료 시간 *</label>
            <select class="ms-select" id="ms-te"></select>
          </div>
          <div class="ms-field">
            <label class="ms-label" for="ms-fee">강사료 (만원)</label>
            <input class="ms-input" type="number" id="ms-fee" placeholder="0" min="0" />
          </div>
          <div class="ms-field">
            <label class="ms-label" for="ms-progress">진행 상태</label>
            <select class="ms-select" id="ms-progress">
              <option value="scheduled">📅 강의 예정</option>
              <option value="discussing">💬 논의 중</option>
              <option value="onhold">⏸ 보류 중</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ② 시작일 + 회차 -->
      <div class="ms-section">
        <p class="ms-section-title">일정 설정</p>
        <div class="ms-grid">
          <div class="ms-field">
            <label class="ms-label" for="ms-start">시작일 *</label>
            <input class="ms-input" type="date" id="ms-start" />
          </div>
          <div class="ms-field">
            <label class="ms-label" for="ms-total">총 회차 수 *</label>
            <input class="ms-input" type="number" id="ms-total" min="1" max="200" placeholder="예) 8" />
          </div>
        </div>

        <!-- ③ 반복 유형 -->
        <div class="ms-field" style="margin-top:12px">
          <label class="ms-label" for="ms-rec">반복 유형</label>
          <select class="ms-select" id="ms-rec">
            <option value="daily">매일 (Daily)</option>
            <option value="weekly" selected>매주 (Weekly)</option>
            <option value="monthly">매월 (Monthly)</option>
          </select>
        </div>

        <!-- Daily sub -->
        <div id="ms-opt-daily" class="ms-sub" style="display:none">
          <div class="ms-field" style="max-width:160px">
            <label class="ms-label" for="ms-day-n">N일 마다</label>
            <input class="ms-input" type="number" id="ms-day-n" min="1" value="1" />
          </div>
        </div>

        <!-- Weekly sub -->
        <div id="ms-opt-weekly" class="ms-sub">
          <div class="ms-grid" style="grid-template-columns:140px 1fr;align-items:start">
            <div class="ms-field">
              <label class="ms-label" for="ms-week-n">N주 마다</label>
              <input class="ms-input" type="number" id="ms-week-n" min="1" value="1" />
            </div>
            <div class="ms-field">
              <label class="ms-label">요일 선택 (복수 가능)</label>
              <div class="ms-dow-row" id="ms-dow-row">${dowPills}</div>
            </div>
          </div>
        </div>

        <!-- Monthly sub -->
        <div id="ms-opt-monthly" class="ms-sub" style="display:none">
          <div class="ms-field" style="max-width:160px;margin-bottom:12px">
            <label class="ms-label" for="ms-month-n">N개월 마다</label>
            <input class="ms-input" type="number" id="ms-month-n" min="1" value="1" />
          </div>
          <div class="ms-radio-group" id="ms-month-mode">
            <label class="ms-radio-label">
              <input type="radio" name="ms-mm" value="same" checked />
              같은 날짜 반복 (예: 매월 15일)
            </label>
            <label class="ms-radio-label">
              <input type="radio" name="ms-mm" value="nth" />
              같은 순서의 요일 (예: 매월 2번째 화요일)
            </label>
            <label class="ms-radio-label">
              <input type="radio" name="ms-mm" value="specific" />
              지정 날짜 선택 (복수 가능)
            </label>
          </div>
          <div class="ms-day-grid" id="ms-day-grid" style="display:none">${dayChips}</div>
        </div>

        <!-- Holiday toggle -->
        <div class="ms-toggle-row">
          <div>
            <span class="ms-toggle-label">🇰🇷 한국 공휴일 건너뛰기</span>
            <span class="ms-toggle-sub">공휴일이 겹치면 다음 날로 자동 이동합니다.</span>
          </div>
          <button class="ms-toggle" id="ms-hol-toggle" role="switch" aria-checked="false" title="공휴일 건너뛰기 토글"></button>
        </div>
      </div>

      <!-- Generate -->
      <button class="ms-gen-btn" id="ms-gen">생성 미리보기 →</button>

      <!-- ④ Preview (hidden until generated) -->
      <div id="ms-preview" style="display:none">
        <hr class="ms-divider" />
        <div class="ms-preview-header">
          <span class="ms-preview-count" id="ms-pcount"></span>
          <span class="ms-holiday-badge" id="ms-hbadge" style="display:none">★ 공휴일 → 자동 이동됨</span>
        </div>
        <div class="ms-preview-wrap">
          <table class="ms-preview-table">
            <thead>
              <tr>
                <th style="width:34px">#</th>
                <th>날짜</th>
                <th>시작</th>
                <th>종료</th>
                <th style="width:100%">주제 / 메모</th>
                <th class="th-act">추가/삭제</th>
              </tr>
            </thead>
            <tbody id="ms-tbody"></tbody>
          </table>
        </div>
      </div>

    </div><!-- /ms-body -->

    <div class="ms-foot">
      <button class="ms-foot-btn ms-foot-btn--cancel" id="ms-cancel">취소</button>
      <button class="ms-foot-btn ms-foot-btn--save"   id="ms-save" disabled>저장하기</button>
    </div>

  </div>
</div>`;
}

/* ════════════════════════════════════════
   모듈 상태
════════════════════════════════════════ */
let _sessions   = [];   // generated sessions
let _skipHol    = false;
let _selDow     = new Set([0]);        // 0=Mon default
let _selDays    = new Set();           // specific month days
let _getCtx     = null;

/* ════════════════════════════════════════
   공개 API
════════════════════════════════════════ */
export function initMultiSessionModal(getCtx) {
  _getCtx = getCtx;
  _injectStyles();
  if (!document.getElementById('ms-bd')) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _html();
    document.body.appendChild(tmp.firstElementChild);
    _bindEvents();
  }
}

export function openMultiSessionModal() {
  const bd = document.getElementById('ms-bd');
  if (!bd) return;
  _reset();
  requestAnimationFrame(() => bd.classList.add('open'));
  document.body.style.overflow = 'hidden';
  document.getElementById('ms-title')?.focus();
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
  _selDow   = new Set([0]);
  _selDays  = new Set();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const $ = id => document.getElementById(id);
  $('ms-title').value   = '';
  $('ms-client').value  = '';
  $('ms-place').value   = '';
  $('ms-fee').value     = '';
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

  // Hide preview + disable save
  $('ms-preview').style.display = 'none';
  $('ms-save').disabled  = true;
  $('ms-save').textContent = '저장하기';
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
    if (e.key === 'Escape' && $('ms-bd')?.classList.contains('open')) _close();
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

  // Generate
  $('ms-gen').addEventListener('click', _handleGenerate);

  // Save
  $('ms-save').addEventListener('click', _handleSave);

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
  $('ms-pcount').textContent    = `${_sessions.length}회차 생성됨`;
  $('ms-save').textContent      = `저장하기 (${_sessions.length}회차)`;

  $('ms-tbody').innerHTML = _sessions.map((s, i) => {
    const shifted = s.wasShifted;
    
    const tip     = shifted ? `title="원래 날짜: ${s.originalDate} (공휴일)"` : '';
    
    return `
      <tr class="${shifted ? 'row-shifted' : ''}" data-idx="${i}" ${tip}>
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
    _sessions[parseInt(inp.dataset.idx)][inp.dataset.f] = inp.value;
  });

  const title = $('ms-title').value.trim();
  if (!title) {
    window.showToast?.('강의명을 입력하세요.', 'warn');
    saveBtn.disabled = false;
    saveBtn.textContent = `저장하기 (${_sessions.length}회차)`;
    return;
  }

  const groupId      = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sessionTotal = _sessions.length;
  const common = {
    uid:             currentUser.uid,
    groupId,
    title,
    client:          $('ms-client').value.trim(),
    place:           $('ms-place').value.trim(),
    fee:             Number($('ms-fee').value) || 0,
    progressStatus:  $('ms-progress').value || 'scheduled',
    sessionTotal,
    isPaid:          false,
    isDocumented:    false,
  };

  try {
    const batch = writeBatch(db);
    for (const s of _sessions) {
      const ref = doc(collection(db, 'lectures'));
      batch.set(ref, {
        ...common,
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
    saveBtn.disabled = false;
    saveBtn.textContent = `저장하기 (${sessionTotal}회차)`;
  }
}
