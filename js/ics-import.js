/**
 * ics-import.js
 *
 * Parses an .ics file, expands recurring events, maps each occurrence to the
 * allLectures object shape, renders a selectable preview table, and logs the
 * selected records when "Save Selected" is clicked.
 *
 * Dependencies (loaded via CDN before this script):
 *   • ical.js  – https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js
 *   • rrule.js – https://cdn.jsdelivr.net/npm/rrule@2.8.1/dist/es5/rrule.min.js
 */

'use strict';

// ── CDN globals ───────────────────────────────────────────────────────────────
// rrule@2.8.x UMD build exposes everything under window.rrule (not as bare globals).
// Destructure here so the rest of the file can use RRule / RRuleSet as normal names.
const { RRule, RRuleSet } = window.rrule;

// ── Year-range filter (keep only ±1 year from today) ─────────────────────────
const _CY           = new Date().getFullYear();
const _YEAR_RANGE   = { start: new Date(_CY - 1, 0, 1), end: new Date(_CY + 1, 11, 31, 23, 59, 59) };
const _inRange = d  => d >= _YEAR_RANGE.start && d <= _YEAR_RANGE.end;

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {Object[]} Holds every mapped lecture object after a successful parse. */
let parsedEvents = [];

/**
 * Monotonically-increasing counter seeded at the current timestamp.
 * Each call to nextId() produces a unique integer ID.
 */
let _idCounter = Date.now();
function nextId() { return _idCounter++; }

// ── Date / time utilities ─────────────────────────────────────────────────────

/**
 * Convert an ICAL.Time to a plain JS Date using the calendar's wall-clock
 * values (year/month/day/hour/minute/second) without applying any timezone
 * offset.  This preserves what the user typed in their calendar app regardless
 * of the browser's local timezone.
 *
 * @param  {ICAL.Time} t
 * @returns {Date}
 */
function icalToLocal(t) {
  // 1. 하루 종일 진행되는 일정 (시간 단위가 없는 경우)
  if (t.isDate) {
    return new Date(t.year, t.month - 1, t.day);
  }
  
  // 💡 핵심 수정: ical.js의 내장 함수를 사용하여 UTC와 타임존을 완벽하게 보정합니다.
  if (typeof t.toJSDate === 'function') {
    return t.toJSDate();
  }

  // (만약의 경우를 대비한 수동 UTC 변환 안전장치)
  if (t.isUTC || (t.zone && t.zone.tzid === 'UTC')) {
    return new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second));
  }
  
  // 타임존이 없는 로컬 시간일 경우
  return new Date(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
}

const pad = n => String(n).padStart(2, '0');

/** @returns {string}  "YYYY-MM-DD" */
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @returns {string}  "HH:mm"  or ""  for all-day events */
function fmtTime(d, isAllDay) {
  if (isAllDay) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── ICS parsing ───────────────────────────────────────────────────────────────

/**
 * Top-level entry point.  Parses raw ICS text and returns an array of objects
 * in the allLectures format.
 *
 * @param  {string} text  Raw .ics file contents.
 * @returns {Object[]}
 */
function parseICS(text) {
  let jcal;
  try {
    jcal = ICAL.parse(text);
  } catch (e) {
    throw new Error(`Could not parse iCalendar file: ${e.message}`);
  }

  const cal  = new ICAL.Component(jcal);
  const vevents = cal.getAllSubcomponents('vevent');
  if (!vevents.length) {
    throw new Error('No VEVENT components found in this file.');
  }

  // Register any VTIMEZONE blocks embedded in the file.
  // ical.js uses these to resolve TZID references in DTSTART/DTEND.
  for (const vtz of cal.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(new ICAL.Timezone(vtz));
    } catch (_) { /* skip unknown/malformed timezone blocks */ }
  }

  // ── Step 1: group VEVENTs by UID ──────────────────────────────────────────
  // Google Calendar (and RFC 5545) represents a recurring series as one master
  // VEVENT with the RRULE property, plus zero-or-more override VEVENTs that
  // carry a RECURRENCE-ID property.  We bucket them together here.
  const byUID = {};
  for (const vevent of vevents) {
    const uid = vevent.getFirstPropertyValue('uid') || `__anon-${nextId()}`;
    if (!byUID[uid]) byUID[uid] = { master: null, overrides: [] };

    if (vevent.hasProperty('recurrence-id')) {
      byUID[uid].overrides.push(vevent);
    } else {
      byUID[uid].master = vevent;
    }
  }

  // ── Step 2: flatten each series into individual lecture objects ───────────
  const result = [];

  for (const [uid, { master, overrides }] of Object.entries(byUID)) {
    if (!master) {
      // Edge case: orphaned overrides with no master VEVENT.
      for (const ov of overrides) {
        if (isCancelled(ov)) continue;
        const lec = buildLecture(new ICAL.Event(ov), ov, uid, false);
        if (lec) result.push(lec);
      }
      continue;
    }

    const masterEv           = new ICAL.Event(master);
    const isRecurringSeries  = master.hasProperty('rrule');

    if (isRecurringSeries) {
      // Build a date-keyed lookup so we can apply overrides (edited instances)
      // and skip cancelled ones.
      const overrideByDate = {};
      for (const ov of overrides) {
        const recId = ov.getFirstPropertyValue('recurrence-id');
        if (recId) overrideByDate[fmtDate(icalToLocal(recId))] = ov;
      }

      // expandRRule already clamps to the 3-year window via .between()
      for (const [startJS, endJS, isAllDay] of expandRRule(master, masterEv)) {
        const dateKey  = fmtDate(startJS);
        const override = overrideByDate[dateKey];

        if (override) {
          if (isCancelled(override)) continue;
          const lec = buildLecture(new ICAL.Event(override), override, uid, true);
          if (lec) result.push(lec);
        } else {
          const lec = buildLecture(masterEv, master, uid, true, startJS, endJS, isAllDay);
          if (lec) result.push(lec);
        }
      }
    } else {
      // Single event — buildLecture returns null if outside 3-year window
      const lec = buildLecture(masterEv, master, uid, false);
      if (lec) result.push(lec);
    }
  }

  // Sort chronologically
  result.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.timeStart.localeCompare(b.timeStart);
  });

  return result;
}

/**
 * Returns true when the VEVENT carries STATUS:CANCELLED (deleted instance).
 */
function isCancelled(vevent) {
  const s = vevent.getFirstPropertyValue('status');
  return s && s.toUpperCase() === 'CANCELLED';
}

// ── RRULE expansion via rrule.js ──────────────────────────────────────────────

/**
 * Expand a recurring VEVENT into an array of [startDate, endDate, isAllDay]
 * tuples.
 *
 * Strategy:
 *   1. Read the RRULE property value from ical.js as an ICAL.Recur string
 *      (e.g. "FREQ=WEEKLY;BYDAY=MO,WE").
 *   2. Feed it to RRule.parseString() to get an options object.
 *   3. Attach the dtstart so rrule.js knows when the series begins.
 *   4. Wrap in an RRuleSet and call exdate() for every EXDATE listed in the
 *      VEVENT – this removes deleted instances without extra post-processing.
 *   5. Call .all() with a 500-occurrence safety cap.
 *
 * groupId rationale:
 *   Every occurrence produced here receives the same groupId (the UID), which
 *   lets downstream code treat them as one logical series.
 *
 * @param  {ICAL.Component} vevent
 * @param  {ICAL.Event}     event
 * @returns {Array<[Date, Date, boolean]>}
 */
function expandRRule(vevent, event) {
  const dtstart  = event.startDate;
  const isAllDay = dtstart.isDate;
  const startJS  = icalToLocal(dtstart);

  // Duration: prefer DTEND, fall back to DURATION, then default to 1 h / 1 day
  const endJS = event.endDate
    ? icalToLocal(event.endDate)
    : new Date(startJS.getTime() + (isAllDay ? 86_400_000 : 3_600_000));
  const durationMs = endJS - startJS;

  // Extract the raw RRULE value string (without the "RRULE:" key prefix)
  // ical.js returns an ICAL.Recur object; .toString() gives "FREQ=...;..."
  const rruleStr = vevent.getFirstProperty('rrule').getFirstValue().toString();

  let rruleOptions;
  try {
    rruleOptions = RRule.parseString(rruleStr);
  } catch (e) {
    console.warn('[ics-import] Unrecognised RRULE – treating as single event:', rruleStr, e);
    return [[startJS, endJS, isAllDay]];
  }
  rruleOptions.dtstart = startJS;

  // RRuleSet lets us attach EXDATEs (excluded recurrence dates)
  const ruleSet = new RRuleSet();
  ruleSet.rrule(new RRule(rruleOptions));

  for (const exProp of vevent.getAllProperties('exdate')) {
    for (const exVal of exProp.getValues()) {
      ruleSet.exdate(icalToLocal(exVal));
    }
  }

  // Expand only within [CY-1 Jan 1 … CY+1 Dec 31] using RRuleSet.between().
  // This is far more efficient than .all() + filter because rrule.js skips
  // occurrences outside the window at the rule-expansion level.
  const starts = ruleSet.between(_YEAR_RANGE.start, _YEAR_RANGE.end, /*inclusive=*/true);
  return starts.map(s => [s, new Date(s.getTime() + durationMs), isAllDay]);
}

// ── Data model mapping ────────────────────────────────────────────────────────

/**
 * Map an ICAL.Event + its raw VEVENT component into the allLectures shape.
 *
 * @param  {ICAL.Event}     event
 * @param  {ICAL.Component} vevent
 * @param  {string}         uid
 * @param  {boolean}        isRecurring  true → populate groupId
 * @param  {Date=}          startJS      pre-computed start (recurring occurrences)
 * @param  {Date=}          endJS        pre-computed end
 * @param  {boolean=}       isAllDay
 * @returns {Object}  allLectures record
 */
function buildLecture(event, vevent, uid, isRecurring, startJS, endJS, isAllDay) {
  // For standalone events, derive start/end directly from the ICAL.Event
  if (startJS === undefined) {
    isAllDay = event.startDate.isDate;
    startJS  = icalToLocal(event.startDate);
    endJS    = event.endDate
      ? icalToLocal(event.endDate)
      : new Date(startJS.getTime() + (isAllDay ? 86_400_000 : 3_600_000));
  }

  // Guard: drop single-event occurrences outside the 3-year window
  if (!_inRange(startJS)) return null;

  // Enforce strict YYYY-MM-DD by going through fmtDate (never from ical string directly)
  const dateStr = fmtDate(startJS);

  return {
    id:        nextId(),
    groupId:   isRecurring ? uid : null,
    title:     event.summary    || '(No title)',
    date:      dateStr,
    timeStart: fmtTime(startJS, isAllDay),
    timeEnd:   fmtTime(endJS,   isAllDay),
    fee:       0,
    progressStatus:   'needs_review',   // always needs_review for imported events
    location:  vevent.getFirstPropertyValue('location') || '',
    memo:      'Imported from Google Calendar',
  };
}

// ── UI rendering ──────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTable(events) {
  const tbody = document.getElementById('eventsBody');
  tbody.innerHTML = '';

  for (const ev of events) {
    const tr = document.createElement('tr');
    tr.dataset.id = ev.id;

    tr.innerHTML = `
      <td class="col-check">
        <input type="checkbox" class="row-check" data-id="${ev.id}" checked>
      </td>
      <td title="${escHtml(ev.title)}">${escHtml(ev.title)}</td>
      <td>${ev.date}</td>
      <td>${ev.timeStart || '—'}</td>
      <td>${ev.timeEnd  || '—'}</td>
      <td title="${escHtml(ev.location)}">${escHtml(ev.location) || '—'}</td>
      <td>${ev.groupId ? '<span class="badge-recurring">Recurring</span>' : '—'}</td>
    `;
    tbody.appendChild(tr);
  }

  syncMasterCheckbox();
}

function updateEventCount() {
  const total   = document.querySelectorAll('.row-check').length;
  const checked = document.querySelectorAll('.row-check:checked').length;
  document.getElementById('eventCount').textContent = `${checked} / ${total} selected`;
}

function syncMasterCheckbox() {
  const total   = document.querySelectorAll('.row-check').length;
  const checked = document.querySelectorAll('.row-check:checked').length;
  const master  = document.getElementById('masterCheck');
  master.indeterminate = checked > 0 && checked < total;
  master.checked       = total > 0 && checked === total;
  updateEventCount();
}

// ── File handling ─────────────────────────────────────────────────────────────

function handleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.ics') && file.type !== 'text/calendar') {
    showError('Please select a valid .ics (iCalendar) file.');
    return;
  }

  hideError();

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const events = parseICS(e.target.result);
      if (!events.length) throw new Error('The file contained no importable events.');
      showPreview(events);
    } catch (err) {
      showError(err.message);
      console.error('[ics-import]', err);
    }
  };
  reader.onerror = () => showError('Could not read the file.');
  reader.readAsText(file);
}

function showError(msg) {
  const el = document.getElementById('errorBanner');
  document.getElementById('errorMessage').textContent = msg;
  el.hidden = false;
}
function hideError() {
  document.getElementById('errorBanner').hidden = true;
}

function showPreview(events) {
  parsedEvents = events;
  document.getElementById('previewSection').hidden = false;
  document.getElementById('resultBanner').hidden   = true;
  renderTable(events);
}

function resetUI() {
  parsedEvents = [];
  document.getElementById('previewSection').hidden = true;
  document.getElementById('resultBanner').hidden   = true;
  document.getElementById('errorBanner').hidden    = true;
  document.getElementById('fileInput').value       = '';
  document.getElementById('eventsBody').innerHTML  = '';
}

// ── Event wiring ──────────────────────────────────────────────────────────────

// File input
document.getElementById('fileInput').addEventListener('change', e => {
  handleFile(e.target.files[0]);
});

// Drag & drop
const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});
// Clicking anywhere in the drop zone (except the label) opens the file picker
dropZone.addEventListener('click', e => {
  if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
    document.getElementById('fileInput').click();
  }
});

// Master "toggle all" checkbox
document.getElementById('masterCheck').addEventListener('change', e => {
  const on = e.target.checked;
  document.querySelectorAll('.row-check').forEach(cb => {
    cb.checked = on;
    cb.closest('tr').classList.toggle('row--unchecked', !on);
  });
  updateEventCount();
});

// Select All / Deselect All buttons
document.getElementById('selectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.row-check').forEach(cb => {
    cb.checked = true;
    cb.closest('tr').classList.remove('row--unchecked');
  });
  syncMasterCheckbox();
});
document.getElementById('deselectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.row-check').forEach(cb => {
    cb.checked = false;
    cb.closest('tr').classList.add('row--unchecked');
  });
  syncMasterCheckbox();
});

// Individual row checkboxes (event delegation on tbody)
document.getElementById('eventsBody').addEventListener('change', e => {
  if (!e.target.classList.contains('row-check')) return;
  e.target.closest('tr').classList.toggle('row--unchecked', !e.target.checked);
  syncMasterCheckbox();
});

// Save Selected → localStorage bridge → calendar.js picks this up on next load
document.getElementById('saveBtn').addEventListener('click', () => {
  const selectedIds = new Set(
    [...document.querySelectorAll('.row-check:checked')].map(cb => Number(cb.dataset.id))
  );
  const selected = parsedEvents.filter(ev => selectedIds.has(ev.id));

  if (!selected.length) {
    alert('저장할 이벤트를 하나 이상 선택해 주세요.');
    return;
  }

  localStorage.setItem('temp_lectures', JSON.stringify(selected));

  const n = selected.length;
  document.getElementById('savedCount').textContent = `${n}건`;
  const banner = document.getElementById('resultBanner');
  banner.hidden = false;
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // 1. 즉시 이동을 원하시면 아래 주석 해제
 location.href = 'calendar.html'; 

});

// Reset / upload another file
document.getElementById('resetBtn').addEventListener('click', resetUI);
