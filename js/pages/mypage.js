// js/pages/mypage.js — 마이 페이지 (Firebase Auth + Firestore 연동, ES Module)

import { auth, db, fetchGoogleCalendarEvents, authGuard } from '../api.js';
import {
  collection, doc, getDoc, setDoc, addDoc,
  query, where, getDocs, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  escapeHtml, classifyStatus, STATUS_META,
  showToast, setVal, getVal, updateSidebarUI,
} from '../utils.js';

/* ════════════════════════════════════════
   기기 전용 설정 (스케줄러·정산) — localStorage
════════════════════════════════════════ */
const DEFAULT_DEVICE = {
  scheduler: {
    transport:    'car',
    bufferTime:   30,
    bufferCustom: 45,
    setupTime:    20,
    wrapupTime:   15,
    parkingAlert: true,
  },
  settlement: {
    hourlyRate:    300000,
    bankName:      '',
    accountNumber: '',
    accountHolder: '',
    docs: { bizreg: null, bankbook: null, idcard: null },
  },
};

function loadDevice() {
  try {
    const raw = localStorage.getItem('kangbiseo_device');
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DEVICE));
    // 구버전 키 호환: kangbiseo_mypage
    const parsed = JSON.parse(raw);
    return parsed;
  } catch { return JSON.parse(JSON.stringify(DEFAULT_DEVICE)); }
}

function saveDevice(s) {
  localStorage.setItem('kangbiseo_device', JSON.stringify(s));
}

let device = loadDevice();

/* ════════════════════════════════════════
   Firebase 프로필 상태 (Firestore 연동)
════════════════════════════════════════ */
let currentUser        = null;
let fbKeywords         = [];
let fbTopics           = [];
let selectedTopicColor = '#2563c4';
let topicIdCounter     = 1;

/* ════════════════════════════════════════
   nav-badge (localStorage에서 즉시 초기화)
════════════════════════════════════════ */
function initNavBadge() {
  const count = parseInt(localStorage.getItem('navBadgeCount') || '0', 10);
  const el = document.getElementById('nav-badge-lectures');
  if (!el) return;
  el.textContent = count;
  el.style.display = count > 0 ? '' : 'none';
}

/* ════════════════════════════════════════
   섹션 내비 + IntersectionObserver
════════════════════════════════════════ */
function initSectionNav() {
  const navItems = document.querySelectorAll('.mypage-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById(item.dataset.target)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  const sections = document.querySelectorAll('.mypage-card[id]');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      navItems.forEach(n => n.classList.remove('active'));
      document.querySelector(`.mypage-nav-item[data-target="${e.target.id}"]`)
        ?.classList.add('active');
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  sections.forEach(s => obs.observe(s));
}

/* ════════════════════════════════════════
   SECTION 1: 프로필
   이름·이메일 → Firebase Auth (읽기 전용)
   슬로건·소개·키워드·태그 → Firestore users/{uid}
════════════════════════════════════════ */
async function loadFirebaseProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      fbKeywords     = Array.isArray(d.keywords) ? d.keywords : [];
      fbTopics       = Array.isArray(d.topics)   ? d.topics   : [];
      topicIdCounter = fbTopics.length > 0
        ? Math.max(...fbTopics.map(t => t.id)) + 1 : 1;
      setVal('profile-slogan',    d.slogan   || '');
      setVal('profile-bio',       d.bio      || '');
      setVal('profile-nickname',  d.nickname || '');
      // Firestore 저장값이 있으면 기기 설정보다 우선 적용
      if (d.setupTime  != null) device.scheduler.setupTime  = Number(d.setupTime);
      if (d.wrapupTime != null) device.scheduler.wrapupTime = Number(d.wrapupTime);
    } else {
      fbKeywords = []; fbTopics = [];
    }
  } catch (err) {
    console.error('[강비서] 프로필 로드 오류:', err);
  }
}

function initProfile(user) {
  /* 이름·이메일: Firebase Auth에서 읽기 전용으로 표시 */
  const readonlyStyle = {
    background: 'var(--color-bg-elevated, #f3f4f6)',
    cursor:     'not-allowed',
  };
  const nameEl = document.getElementById('profile-name');
  if (nameEl) {
    nameEl.value = user.displayName || '';
    nameEl.setAttribute('readonly', 'true');
    Object.assign(nameEl.style, readonlyStyle);
    nameEl.title = 'Firebase 계정 이름은 로그인 화면에서 설정됩니다.';
  }
  const emailEl = document.getElementById('profile-email');
  if (emailEl) {
    emailEl.value = user.email || '';
    emailEl.setAttribute('readonly', 'true');
    Object.assign(emailEl.style, readonlyStyle);
  }

  /* 프로필 사진 복원 */
  const photoUrl = localStorage.getItem('profilePhotoUrl');
  if (photoUrl) showProfilePhoto(photoUrl);

  /* 사진 업로드 */
  document.getElementById('profile-photo-input')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('파일 크기는 5MB 이하여야 합니다.', 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      localStorage.setItem('profilePhotoUrl', ev.target.result);
      showProfilePhoto(ev.target.result);
    };
    reader.readAsDataURL(file);
  });

  /* 키워드 입력 이벤트 */
  const kwInput = document.getElementById('keyword-input');
  kwInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(kwInput.value); }
  });
  kwInput?.addEventListener('blur', () => { if (kwInput.value.trim()) addKeyword(kwInput.value); });
  document.getElementById('keyword-chip-row')?.addEventListener('click', () => kwInput?.focus());
}

function showProfilePhoto(dataUrl) {
  const initial = document.getElementById('profile-photo-initial');
  const img     = document.getElementById('profile-photo-img');
  if (initial) initial.style.display = 'none';
  if (img) { img.src = dataUrl; img.style.display = 'block'; }
}

function updateAvatarInitial(name) {
  const photoInitial = document.getElementById('profile-photo-initial');
  if (photoInitial && name && !localStorage.getItem('profilePhotoUrl')) {
    photoInitial.textContent = name[0];
  }
}

function renderKeywordChips() {
  const row   = document.getElementById('keyword-chip-row');
  const input = document.getElementById('keyword-input');
  if (!row || !input) return;
  row.querySelectorAll('.keyword-chip').forEach(c => c.remove());
  fbKeywords.forEach(kw => {
    const chip = document.createElement('span');
    chip.className = 'keyword-chip';
    chip.innerHTML = `${escapeHtml(kw)}<button class="keyword-chip-del" type="button" aria-label="${escapeHtml(kw)} 삭제">×</button>`;
    chip.querySelector('.keyword-chip-del').addEventListener('click', () => {
      fbKeywords = fbKeywords.filter(k => k !== kw);
      renderKeywordChips();
    });
    row.insertBefore(chip, input);
  });
}

function addKeyword(raw) {
  const kw = raw.replace(/,/g, '').trim();
  const input = document.getElementById('keyword-input');
  if (!kw || fbKeywords.includes(kw)) { if (input) input.value = ''; return; }
  if (fbKeywords.length >= 10) { showToast('키워드는 최대 10개까지 가능합니다.', 'warn'); return; }
  fbKeywords.push(kw);
  renderKeywordChips();
  if (input) input.value = '';
}

/* ════════════════════════════════════════
   SECTION 2: 스케줄러
════════════════════════════════════════ */
function initScheduler() {
  const s = device.scheduler;
  setTransport(s.transport);
  document.querySelectorAll('.transport-btn').forEach(btn => {
    btn.addEventListener('click', () => setTransport(btn.dataset.transport));
  });
  const bufVal = s.bufferTime === 'custom' ? 'custom' : String(s.bufferTime);
  const bufRadio = document.querySelector(`input[name="buffer-time"][value="${bufVal}"]`);
  if (bufRadio) bufRadio.checked = true;
  toggleCustomBuffer(bufVal === 'custom');
  document.querySelectorAll('input[name="buffer-time"]').forEach(r => {
    r.addEventListener('change', () => toggleCustomBuffer(r.value === 'custom'));
  });
  const customInput = document.getElementById('buffer-custom-value');
  if (customInput) customInput.value = s.bufferCustom;
  const setupInput = document.getElementById('setup-time-input');
  if (setupInput) setupInput.value = s.setupTime ?? 20;
  const wrapupInput = document.getElementById('wrapup-time-input');
  if (wrapupInput) wrapupInput.value = s.wrapupTime ?? 15;
  const parkingCb = document.getElementById('parking-alert');
  if (parkingCb) parkingCb.checked = s.parkingAlert;
  updateParkingRow(s.transport);
}

function setTransport(value) {
  device.scheduler.transport = value;
  document.querySelectorAll('.transport-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.transport === value);
  });
  updateParkingRow(value);
}

function updateParkingRow(transport) {
  const row = document.getElementById('parking-toggle-row');
  if (!row) return;
  row.style.opacity      = transport === 'car' ? '1' : '0.4';
  row.style.pointerEvents = transport === 'car' ? '' : 'none';
}

function toggleCustomBuffer(show) {
  document.getElementById('buffer-custom-wrap')?.classList.toggle('hidden', !show);
}

/* ════════════════════════════════════════
   SECTION 3: 정산 & 행정
════════════════════════════════════════ */
function initSettlement() {
  const s = device.settlement;
  setVal('hourly-rate',    s.hourlyRate);
  setVal('bank-name',      s.bankName);
  setVal('account-number', s.accountNumber);
  setVal('account-holder', s.accountHolder);
  updateFeeDisplay(s.hourlyRate);
  document.getElementById('hourly-rate')?.addEventListener('input', e => {
    updateFeeDisplay(Number(e.target.value));
  });
  Object.entries(s.docs).forEach(([key, val]) => { if (val) markDocUploaded(key, val); });
  document.querySelectorAll('.doc-upload-input').forEach(input => {
    input.addEventListener('change', e => {
      const file = e.target.files[0]; const key = input.dataset.doc;
      if (!file || !key) return;
      device.settlement.docs[key] = file.name;
      markDocUploaded(key, file.name);
    });
  });
  document.querySelectorAll('.doc-upload-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const key = btn.dataset.doc;
      device.settlement.docs[key] = null;
      const inputEl = document.getElementById(`doc-input-${key}`);
      if (inputEl) inputEl.value = '';
      unmarkDocUploaded(key);
    });
  });
}

function updateFeeDisplay(val) {
  const el = document.getElementById('fee-display');
  if (el) el.textContent = `= 시간당 ${(Number(val) || 0).toLocaleString('ko-KR')}원`;
}

function markDocUploaded(key, filename) {
  document.getElementById(`doc-card-${key}`)?.classList.add('uploaded');
  const st = document.getElementById(`doc-status-${key}`);
  if (st) st.textContent = filename;
}

function unmarkDocUploaded(key) {
  document.getElementById(`doc-card-${key}`)?.classList.remove('uploaded');
  const st = document.getElementById(`doc-status-${key}`);
  if (st) st.textContent = '미등록';
}

/* ════════════════════════════════════════
   SECTION 4: 강의 주제 태그
════════════════════════════════════════ */
function initTopics() {
  renderTopicTags();
  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTopicColor = btn.dataset.color;
    });
  });
  document.getElementById('topic-add-btn')?.addEventListener('click', addTopicTag);
  document.getElementById('topic-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTopicTag(); }
  });
}

function renderTopicTags() {
  const list = document.getElementById('topic-tag-list');
  if (!list) return;
  list.innerHTML = '';
  if (fbTopics.length === 0) {
    list.innerHTML = '<span style="color:var(--color-text-muted);font-size:var(--font-size-sm);">아직 추가된 태그가 없습니다.</span>';
    return;
  }
  fbTopics.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'topic-tag';
    el.style.background = tag.color;
    el.setAttribute('role', 'listitem');
    el.innerHTML = `<span class="topic-tag-text">${escapeHtml(tag.name)}</span>
      <button type="button" class="topic-tag-del" aria-label="${escapeHtml(tag.name)} 삭제">×</button>`;
    el.querySelector('.topic-tag-del').addEventListener('click', () => {
      fbTopics = fbTopics.filter(t => t.id !== tag.id);
      renderTopicTags();
    });
    list.appendChild(el);
  });
}

function addTopicTag() {
  const input = document.getElementById('topic-add-input');
  const name = input?.value.trim();
  if (!name) { input?.focus(); return; }
  if (fbTopics.some(t => t.name === name)) { showToast('이미 존재하는 태그입니다.', 'warn'); return; }
  if (fbTopics.length >= 20)               { showToast('태그는 최대 20개까지 가능합니다.', 'warn'); return; }
  fbTopics.push({ id: topicIdCounter++, name, color: selectedTopicColor });
  renderTopicTags();
  if (input) input.value = '';
}

/* ════════════════════════════════════════
   SECTION 5: 구독 (정적 UI)
════════════════════════════════════════ */
function initSubscription() {
  document.getElementById('plan-upgrade-btn')?.addEventListener('click',   () => showToast('플랜 변경 페이지는 준비 중입니다.', 'info'));
  document.getElementById('billing-cancel-btn')?.addEventListener('click', () => showToast('구독 취소 기능은 준비 중입니다.', 'info'));
  document.getElementById('billing-method-btn')?.addEventListener('click', () => showToast('결제 수단 변경 기능은 준비 중입니다.', 'info'));
}

/* ════════════════════════════════════════
   구글 캘린더 가져오기
   — 변환 헬퍼 → 목록 모달 → Firestore 저장
════════════════════════════════════════ */

/* Google Calendar dateTime 문자열 → { date: 'YYYY-MM-DD', time: 'HH:MM' } */
function parseGcalDateTime(dtStr) {
  if (!dtStr) return { date: '', time: '' };
  if (dtStr.length === 10) return { date: dtStr, time: '' }; // 종일 이벤트
  const d = new Date(dtStr);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

/*
 * Google Calendar event → lectures 컬렉션 구조로 변환
 * classifyStatus 를 사용해 날짜 기반 progressStatus 를 자동 결정한다.
 *   - 이미 지난 일정 → progressStatus: 'done'
 *   - 앞으로의 일정 → progressStatus: 'scheduled'
 * _status 는 모달 UI 표시용으로만 포함하며 Firestore 에는 저장하지 않는다.
 */
function mapGcalToLecture(ev) {
  const { date, time: timeStart } = parseGcalDateTime(ev.start?.dateTime || ev.start?.date || '');
  const { time: timeEnd }         = parseGcalDateTime(ev.end?.dateTime   || ev.end?.date   || '');

  const base = {
    googleEventId:  ev.id,
    title:          ev.summary  || '(제목 없음)',
    date,
    timeStart:      timeStart   || '09:00',
    timeEnd:        timeEnd     || '10:00',
    place:          ev.location || '',
    client:         '',
    fee:            0,
    isPaid:         false,
    taxType:        'income3_3',
    isDocumented:   false,
    memo:           '',
    progressStatus: 'scheduled',
  };

  // classifyStatus 로 상태 판단 → 지난 일정은 'done' 으로 자동 세팅
  const autoStatus = classifyStatus(base);
  if (autoStatus === 'unpaid' || autoStatus === 'done') {
    base.progressStatus = 'done';
  }

  return { ...base, _status: classifyStatus(base) }; // _status 재계산
}

function initGcalImport() {
  /* ── 1. 카드 삽입 ── */
  const anchor = document.getElementById('section-subscription');
  if (!anchor) return;

  const card = document.createElement('section');
  card.className = 'mypage-card';
  card.id        = 'section-gcal-import';
  card.innerHTML = `
    <div class="mypage-card-header">
      <h2 class="mypage-card-title">🗓 구글 캘린더 가져오기</h2>
      <p class="mypage-card-desc">구글 계정으로 로그인 시 캘린더 일정을 강의로 바로 등록할 수 있습니다.
        오늘 기준 과거 1개월 ~ 향후 3개월 범위를 가져옵니다.</p>
    </div>
    <div class="mypage-card-body" style="display:flex;flex-direction:column;gap:12px;">
      <button id="btn-gcal-fetch" type="button" class="btn btn-secondary"
              style="width:fit-content;padding:8px 18px;">
        📥 구글 캘린더 불러오기
      </button>
      <p id="gcal-fetch-status"
         style="font-size:0.85rem;color:var(--color-text-muted,#6b7280);min-height:1.2em;"></p>
    </div>`;
  anchor.insertAdjacentElement('afterend', card);

  /* ── 2. 가져오기 모달 (body 에 주입) ── */
  const backdrop = document.createElement('div');
  backdrop.id = 'gcal-backdrop';
  Object.assign(backdrop.style, {
    display:    'none',
    position:   'fixed',
    inset:      '0',
    background: 'rgba(0,0,0,0.45)',
    zIndex:     '1200',
    overflowY:  'auto',
    padding:    '40px 16px',
  });
  backdrop.innerHTML = `
    <div id="gcal-modal" role="dialog" aria-modal="true"
         style="background:#fff;border-radius:16px;max-width:640px;
                margin:0 auto;box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:18px 24px;border-bottom:1px solid #f3f4f6;">
        <h3 id="gcal-modal-title"
            style="font-size:1.05rem;font-weight:700;margin:0;color:#111827;">
          🗓 구글 캘린더 일정
        </h3>
        <button id="gcal-modal-close" type="button" aria-label="닫기"
                style="background:none;border:none;font-size:1.1rem;cursor:pointer;
                       color:#6b7280;padding:4px 8px;border-radius:6px;line-height:1;">✕</button>
      </div>
      <ul id="gcal-event-list" role="list"
          style="list-style:none;margin:0;padding:16px 20px;
                 display:flex;flex-direction:column;gap:10px;
                 max-height:62vh;overflow-y:auto;">
      </ul>
    </div>`;
  document.body.appendChild(backdrop);

  function closeModal() {
    backdrop.style.display       = 'none';
    document.body.style.overflow = '';
  }
  document.getElementById('gcal-modal-close')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* ── 3. 불러오기 버튼 ── */
  document.getElementById('btn-gcal-fetch')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('gcal-fetch-status');
    const fetchBtn = document.getElementById('btn-gcal-fetch');
    fetchBtn.disabled = true;
    if (statusEl) statusEl.textContent = '불러오는 중...';

    try {
      const rawEvents = await fetchGoogleCalendarEvents();

      if (rawEvents === null) {
        if (statusEl) statusEl.textContent = '⚠️ 구글 계정으로 재로그인 후 다시 시도해 주세요.';
        showToast('gcal_token이 없습니다. 구글 재로그인이 필요합니다.', 'warn');
        return;
      }
      if (rawEvents.length === 0) {
        if (statusEl) statusEl.textContent = '해당 기간에 가져올 일정이 없습니다.';
        showToast('가져올 캘린더 일정이 없습니다.', 'info');
        return;
      }

      /* 변환 */
      const mapped = rawEvents.map(mapGcalToLecture);

      /* 이미 등록된 googleEventId 목록 조회 (중복 방지용) */
      const snap = await getDocs(
        query(collection(db, 'lectures'), where('uid', '==', currentUser.uid))
      );
      const registeredIds = new Set(
        snap.docs.map(d => d.data().googleEventId).filter(Boolean)
      );

      if (statusEl) statusEl.textContent = `${mapped.length}건 가져옴 — 목록에서 선택해 등록하세요.`;
      renderEventList(mapped, registeredIds);
      document.getElementById('gcal-modal-title').textContent = `🗓 구글 캘린더 일정 (${mapped.length}건)`;
      backdrop.style.display       = 'block';
      document.body.style.overflow = 'hidden';

    } catch (err) {
      console.error('[강비서] 캘린더 불러오기 실패:', err);
      if (statusEl) statusEl.textContent = `❌ 오류: ${err.message}`;
      showToast('캘린더 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      fetchBtn.disabled = false;
    }
  });

  /* ── 4. 이벤트 목록 렌더링 ── */
  function renderEventList(events, registeredIds) {
    const listEl = document.getElementById('gcal-event-list');
    if (!listEl) return;

    listEl.innerHTML = events.map((ev, idx) => {
      const isReg   = registeredIds.has(ev.googleEventId);
      const meta    = STATUS_META[ev._status] || { label: ev._status, cls: '' };
      const timeStr = ev.date
        ? `${ev.date.replace(/-/g, '.')}  ${ev.timeStart}${ev.timeEnd ? ' ~ ' + ev.timeEnd : ''}`
        : '날짜 미정';

      return `
        <li style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;
                   border:1px solid ${isReg ? '#f3f4f6' : '#e5e7eb'};border-radius:10px;
                   background:${isReg ? '#fafafa' : '#fff'};">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="lec-badge ${escapeHtml(meta.cls)}"
                    style="font-size:0.72rem;padding:2px 8px;">${escapeHtml(meta.label)}</span>
              <span style="font-size:0.78rem;color:#6b7280;">${escapeHtml(timeStr)}</span>
            </div>
            <div style="font-weight:600;font-size:0.92rem;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(ev.title)}
            </div>
            ${ev.place
              ? `<div style="font-size:0.8rem;color:#6b7280;">📍 ${escapeHtml(ev.place)}</div>`
              : ''}
          </div>
          <button class="btn-gcal-register" data-idx="${idx}" type="button"
                  style="flex-shrink:0;padding:7px 14px;border-radius:8px;font-size:0.82rem;
                         font-weight:600;cursor:pointer;border:none;white-space:nowrap;
                         background:${isReg ? '#f3f4f6' : '#2563c4'};
                         color:${isReg ? '#9ca3af' : '#fff'};"
                  ${isReg ? 'disabled' : ''}>
            ${isReg ? '등록 완료' : '강의로 등록'}
          </button>
        </li>`;
    }).join('');

    listEl.querySelectorAll('.btn-gcal-register:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        await saveGcalEvent(events[Number(btn.dataset.idx)], btn, registeredIds);
      });
    });
  }

  /* ── 5. Firestore 저장 ── */
  async function saveGcalEvent(mapped, btn, registeredIds) {
    if (!currentUser) return;

    /* 낙관적 중복 재확인 */
    if (registeredIds.has(mapped.googleEventId)) {
      btn.textContent      = '등록 완료';
      btn.disabled         = true;
      btn.style.background = '#f3f4f6';
      btn.style.color      = '#9ca3af';
      return;
    }

    btn.disabled    = true;
    btn.textContent = '저장 중...';

    try {
      const { _status, ...payload } = mapped; // _status 는 런타임 계산값 — Firestore 에 저장 안 함
      await addDoc(collection(db, 'lectures'), {
        uid:       currentUser.uid,
        ...payload,
        createdAt: serverTimestamp(),
      });

      registeredIds.add(mapped.googleEventId);
      btn.textContent      = '등록 완료';
      btn.style.background = '#f3f4f6';
      btn.style.color      = '#9ca3af';
      showToast(`"${mapped.title}" 강의로 등록했습니다.`, 'success');
    } catch (err) {
      console.error('[강비서] 강의 등록 실패:', err);
      btn.disabled    = false;
      btn.textContent = '강의로 등록';
      showToast('등록에 실패했습니다.', 'error');
    }
  }
}

/* ════════════════════════════════════════
   FLOATING SAVE: 기기 설정 + Firestore 프로필
════════════════════════════════════════ */
function initFloatingSave() {
  const btn = document.getElementById('floating-save-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!currentUser) { showToast('로그인이 필요합니다.', 'error'); return; }

    collectDeviceValues();
    saveDevice(device);

    btn.disabled = true;
    btn.innerHTML = '<span class="floating-save-icon">⏳</span> 저장 중...';

    try {
      const nickname = getVal('profile-nickname').trim();
      if (nickname) localStorage.setItem('userNickname', nickname);
      else          localStorage.removeItem('userNickname');
      updateSidebarUI(nickname || currentUser?.displayName || '강사');

      await setDoc(doc(db, 'users', currentUser.uid), {
        slogan:     getVal('profile-slogan'),
        bio:        getVal('profile-bio'),
        nickname,
        keywords:   fbKeywords,
        topics:     fbTopics,
        setupTime:  device.scheduler.setupTime,
        wrapupTime: device.scheduler.wrapupTime,
        updatedAt:  serverTimestamp(),
      }, { merge: true });

      btn.classList.add('saved');
      btn.innerHTML = '<span class="floating-save-icon">✅</span> 저장 완료!';
      setTimeout(() => {
        btn.classList.remove('saved');
        btn.innerHTML = '<span class="floating-save-icon">💾</span> 저장하기';
        btn.disabled = false;
      }, 2200);
      showToast('설정이 저장되었습니다.', 'success');
    } catch (err) {
      console.error('[강비서] 저장 오류:', err);
      btn.innerHTML = '<span class="floating-save-icon">💾</span> 저장하기';
      btn.disabled = false;
      showToast('저장에 실패했습니다.', 'error');
    }
  });
}

function collectDeviceValues() {
  const bufRadio = document.querySelector('input[name="buffer-time"]:checked');
  if (bufRadio) {
    if (bufRadio.value === 'custom') {
      device.scheduler.bufferTime   = 'custom';
      device.scheduler.bufferCustom = Number(getVal('buffer-custom-value')) || 45;
    } else {
      device.scheduler.bufferTime = Number(bufRadio.value);
    }
  }
  const setupInput = document.getElementById('setup-time-input');
  if (setupInput) device.scheduler.setupTime = Number(setupInput.value) || 0;
  const wrapupInput = document.getElementById('wrapup-time-input');
  if (wrapupInput) device.scheduler.wrapupTime = Number(wrapupInput.value) || 0;
  const parkingCb = document.getElementById('parking-alert');
  if (parkingCb)  device.scheduler.parkingAlert = parkingCb.checked;

  device.settlement.hourlyRate    = Number(getVal('hourly-rate')) || 0;
  device.settlement.bankName      = getVal('bank-name');
  device.settlement.accountNumber = getVal('account-number');
  device.settlement.accountHolder = getVal('account-holder');
}

/* ════════════════════════════════════════
   인증 상태 감지 — 진입점
════════════════════════════════════════ */
initNavBadge();
initSectionNav();

authGuard(async user => {
  currentUser = user;

  initProfile(user);
  await loadFirebaseProfile(user.uid);

  const nickname = getVal('profile-nickname').trim();
  if (nickname) {
    localStorage.setItem('userNickname', nickname);
  } else {
    localStorage.removeItem('userNickname');
  }

  renderKeywordChips();
  renderTopicTags();

  initScheduler();
  initSettlement();
  initTopics();
  initSubscription();
  initFloatingSave();
  initGcalImport();
});
