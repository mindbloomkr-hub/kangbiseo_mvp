// js/pages/mypage.js — 마이 페이지 (Firebase Auth + Firestore 연동, ES Module)

import { auth, db, uploadProfilePhoto, fetchGoogleCalendarEvents, authGuard, SUPER_ADMIN_EMAILS } from '../api.js';
import {
  collection, doc, getDoc, setDoc, addDoc,
  query, where, getDocs, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import {
  escapeHtml, classifyStatus, STATUS_META,
  showToast, setVal, getVal, updateSidebarUI, _geocode,
} from '../utils.js';

/* ════════════════════════════════════════
   기기 전용 설정 (스케줄러·정산) — localStorage
════════════════════════════════════════ */
const DEFAULT_DEVICE = {
  scheduler: {
    transport:     'car',
    bufferTime:    30,
    bufferCustom:  45,
    setupTime:     20,
    wrapupTime:    15,
    parkingAlert:  true,
    addresses: { home: '', office: '', other: '' },
    defaultOriginType: 'home',
  },
  settlement: {
    hourlyRate:    30,
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
    const parsed = JSON.parse(raw);
    // Deep-merge so that any key missing in old localStorage data (e.g. settlement,
    // scheduler sub-keys) is always filled in with the current DEFAULT_DEVICE value.
    return {
      scheduler: { ...DEFAULT_DEVICE.scheduler, ...(parsed.scheduler || {}) },
      settlement: {
        ...DEFAULT_DEVICE.settlement,
        ...(parsed.settlement || {}),
        docs: { ...DEFAULT_DEVICE.settlement.docs, ...(parsed.settlement?.docs || {}) },
      },
    };
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
let currentPhotoUrl    = null;   // Firebase Storage URL (null이면 이니셜 표시)
let fbKeywords         = [];
let fbTopics           = [];
let fbMembership       = { status: 'trial', monthlyPrice: 9900, expiresAt: null };
let allLectures        = [];
let selectedTopicColor = '#2563c4';
let topicIdCounter     = 1;
let _colorExpanded     = false;

const TOPIC_COLORS = [
  '#2563c4','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#374151',
  '#16a34a','#ea580c','#9333ea','#0284c7','#e11d48','#65a30d','#ca8a04','#0d9488',
  '#c026d3','#4f46e5','#b45309','#64748b','#be123c','#15803d','#1d4ed8','#78716c',
];
const COLOR_NAMES = {
  '#2563c4':'파란색','#059669':'초록색','#d97706':'주황색','#dc2626':'빨간색',
  '#7c3aed':'보라색','#0891b2':'청록색','#db2777':'분홍색','#374151':'회색',
  '#16a34a':'연두색','#ea580c':'주황빨간색','#9333ea':'바이올렛','#0284c7':'하늘색',
  '#e11d48':'장미색','#65a30d':'라임색','#ca8a04':'황금색','#0d9488':'청록녹색',
  '#c026d3':'자홍색','#4f46e5':'인디고','#b45309':'갈색','#64748b':'슬레이트',
  '#be123c':'크림슨','#15803d':'숲녹색','#1d4ed8':'진파랑','#78716c':'웜그레이',
};


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
   슬로건·소개·키워드·카테고리 → Firestore users/{uid}
════════════════════════════════════════ */
async function loadFirebaseProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      fbKeywords     = Array.isArray(d.keywords)   ? d.keywords   : [];
      fbTopics       = Array.isArray(d.topicTags) ? d.topicTags : (Array.isArray(d.topics) ? d.topics : []);
      topicIdCounter = fbTopics.length > 0
        ? Math.max(...fbTopics.map(t => t.id)) + 1 : 1;
      setVal('profile-slogan',    d.slogan   || '');
      setVal('profile-bio',       d.bio      || '');
      setVal('profile-nickname',  d.nickname || '');
      setVal('prof-tel',          d.tel      || '');

      // 프로필 사진 — Firebase Storage URL (localStorage 대체)
      if (d.photoURL) {
        currentPhotoUrl = d.photoURL;
        showProfilePhoto(d.photoURL);
      }

      // 스케줄러 설정 — Firestore 값이 기기 로컬보다 우선
      if (d.setupTime  != null) device.scheduler.setupTime  = Number(d.setupTime);
      if (d.wrapupTime != null) device.scheduler.wrapupTime = Number(d.wrapupTime);
      if (d.bufferTime != null) {
        if (d.bufferIsCustom) {
          device.scheduler.bufferTime   = 'custom';
          device.scheduler.bufferCustom = Number(d.bufferTime);
        } else {
          device.scheduler.bufferTime = Number(d.bufferTime);
        }
      }
      if (d.addresses != null) {
        device.scheduler.addresses = { home: '', office: '', other: '', ...d.addresses };
      } else if (d.originAddress != null) {
        device.scheduler.addresses = { home: d.originAddress, office: '', other: '' };
      }
      if (d.defaultOriginType != null) device.scheduler.defaultOriginType = d.defaultOriginType;

      // 정산 설정 — 기기를 넘어 동기화
      if (!device.settlement) device.settlement = JSON.parse(JSON.stringify(DEFAULT_DEVICE.settlement));
      if (d.hourlyRate    != null) device.settlement.hourlyRate    = Number(d.hourlyRate);
      if (d.bankName      != null) device.settlement.bankName      = d.bankName;
      if (d.accountNumber != null) device.settlement.accountNumber = d.accountNumber;
      if (d.accountHolder != null) device.settlement.accountHolder = d.accountHolder;

      // 구독 설정 — Firestore 값 반영
      if (d.membershipStatus) fbMembership.status = d.membershipStatus;
      if (d.monthlyPrice != null) fbMembership.monthlyPrice = Number(d.monthlyPrice);
      if (d.membershipExpiresAt) {
        fbMembership.expiresAt = d.membershipExpiresAt.toDate
          ? d.membershipExpiresAt.toDate()
          : new Date(d.membershipExpiresAt);
      }
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

  /* 프로필 사진 복원은 loadFirebaseProfile()에서 처리 */

  /* 사진 업로드 — Firebase Storage에 저장 후 Firestore URL 기록 */
  document.getElementById('profile-photo-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('파일 크기는 5MB 이하여야 합니다.', 'error'); return;
    }
    if (!currentUser) { showToast('로그인이 필요합니다.', 'error'); return; }
    try {
      showToast('사진 업로드 중...', 'info');
      const url = await uploadProfilePhoto(currentUser.uid, file);
      currentPhotoUrl = url;
      showProfilePhoto(url);
      await setDoc(doc(db, 'users', currentUser.uid), { photoURL: url }, { merge: true });
      showToast('프로필 사진이 저장되었습니다.', 'success');
    } catch (err) {
      console.error('[강비서] 사진 업로드 오류:', err);
      showToast('사진 업로드에 실패했습니다.', 'error');
    }
  });

  /* 키워드 입력 이벤트 */
  const kwInput = document.getElementById('keyword-input');
  kwInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(kwInput.value); }
  });
  kwInput?.addEventListener('blur', () => { if (kwInput.value.trim()) addKeyword(kwInput.value); });
  document.getElementById('keyword-chip-row')?.addEventListener('click', () => kwInput?.focus());

  document.getElementById('prof-tel')?.addEventListener('input', function () {
    const digits = this.value.replace(/\D/g, '').slice(0, 11);
    if (digits.length < 4) this.value = digits;
    else if (digits.length < 8) this.value = `${digits.slice(0,3)}-${digits.slice(3)}`;
    else this.value = `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  });
}

function showProfilePhoto(url) {
  currentPhotoUrl = url;
  const initial = document.getElementById('profile-photo-initial');
  const img     = document.getElementById('profile-photo-img');
  if (initial) initial.style.display = 'none';
  if (img) { img.src = url; img.style.display = 'block'; }
}

function updateAvatarInitial(name) {
  const photoInitial = document.getElementById('profile-photo-initial');
  if (photoInitial && name && !currentPhotoUrl) {
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
    btn.addEventListener('click', () => {
      if (btn.classList.contains('transport-btn--disabled')) {
        showToast('대중교통 기능 준비 중입니다.', 'info');
        return;
      }
      setTransport(btn.dataset.transport);
    });
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
  if (setupInput) setupInput.value = (s.setupTime != null ? s.setupTime : 20);
  const wrapupInput = document.getElementById('wrapup-time-input');
  if (wrapupInput) wrapupInput.value = (s.wrapupTime != null ? s.wrapupTime : 15);
  const parkingCb = document.getElementById('parking-alert');
  if (parkingCb) parkingCb.checked = s.parkingAlert;
  const addrs = s.addresses || {};
  const homeInput   = document.getElementById('address-input-home');
  const officeInput = document.getElementById('address-input-office');
  const otherInput  = document.getElementById('address-input-other');
  if (homeInput)   homeInput.value   = addrs.home   || '';
  if (officeInput) officeInput.value = addrs.office || '';
  if (otherInput)  otherInput.value  = addrs.other  || '';
  const defOriginRadio = document.querySelector(
    `input[name="default-origin"][value="${s.defaultOriginType || 'home'}"]`
  );
  if (defOriginRadio) defOriginRadio.checked = true;
  updateParkingRow(s.transport);
}

function setTransport(value) {
  if (value === 'public') return;
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
  if (!device.settlement) return;
  const s = device.settlement;
  setVal('hourly-rate',    s?.hourlyRate);
  setVal('bank-name',      s?.bankName);
  setVal('account-number', s?.accountNumber);
  setVal('account-holder', s?.accountHolder);
  updateFeeDisplay(s?.hourlyRate);
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
  if (el) el.textContent = `= 시간당 ${(Math.round(Number(val) / 10000) || 0).toLocaleString('ko-KR')}원`;
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
   SECTION 4: 카테고리
════════════════════════════════════════ */
function _renderColorPresets(count) {
  const group = document.getElementById('color-preset-group');
  if (!group) return;
  const colors = TOPIC_COLORS.slice(0, count);
  group.innerHTML = colors.map(hex => {
    const name = COLOR_NAMES[hex] || hex;
    const sel  = hex === selectedTopicColor ? ' selected' : '';
    return `<button type="button" class="color-preset${sel}" data-color="${hex}"
              style="background:${hex};" aria-label="${name}" title="${name}"></button>`;
  }).join('');
}

function initTopics() {
  renderTopicTags();
  _renderColorPresets(8);

  const group = document.getElementById('color-preset-group');
  group?.addEventListener('click', e => {
    const btn = e.target.closest('.color-preset');
    if (!btn) return;
    group.querySelectorAll('.color-preset').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTopicColor = btn.dataset.color;
  });

  const showMoreBtn = document.getElementById('color-show-more-btn');
  showMoreBtn?.addEventListener('click', () => {
    if (_colorExpanded) return;
    _colorExpanded = true;
    _renderColorPresets(TOPIC_COLORS.length);
    showMoreBtn.style.display = 'none';
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
    list.innerHTML = '<span style="color:var(--color-text-muted);font-size:var(--font-size-sm);">아직 추가된 카테고리가 없습니다.</span>';
    return;
  }
  fbTopics.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'topic-tag';
    el.style.background = tag.color;
    el.setAttribute('role', 'listitem');
    el.innerHTML = `<span class="topic-tag-text">${escapeHtml(tag.name)}</span>
      <button type="button" class="topic-tag-del" aria-label="${escapeHtml(tag.name)} 삭제">×</button>`;
    el.querySelector('.topic-tag-del').addEventListener('click', async () => {
      const deletedId   = tag.id;
      const deletedName = tag.name;
      if (!confirm(`"${deletedName}" 카테고리를 삭제하시겠습니까?\n이 카테고리가 적용된 모든 강의는 자동으로 "일반 강의"로 변경됩니다.`)) return;
      if (currentUser) {
        try {
          const snap = await getDocs(query(
            collection(db, 'lectures'),
            where('uid',        '==', currentUser.uid),
            where('topicTagId', '==', deletedId)
          ));
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.update(d.ref, { topicTagId: null }));
            await batch.commit();
          }
        } catch (err) {
          console.error('[강비서] 카테고리 cascade 오류:', err);
          showToast('일부 강의의 카테고리 초기화에 실패했습니다.', 'warn');
        }
      }
      fbTopics = fbTopics.filter(t => t.id !== deletedId);
      renderTopicTags();
    });
    list.appendChild(el);
  });
}

function addTopicTag() {
  const input = document.getElementById('topic-add-input');
  const name = input?.value.trim();
  if (!name) { input?.focus(); return; }
  if (fbTopics.some(t => t.name === name)) { showToast('이미 존재하는 카테고리입니다.', 'warn'); return; }
  if (fbTopics.length >= 20)               { showToast('카테고리는 최대 20개까지 가능합니다.', 'warn'); return; }
  fbTopics.push({ id: topicIdCounter++, name, color: selectedTopicColor });
  renderTopicTags();
  if (input) input.value = '';
}

/* ════════════════════════════════════════
   SECTION 5: 구독 (동적 렌더링)
════════════════════════════════════════ */
function initSubscription() {
  const isAdmin = SUPER_ADMIN_EMAILS.has(currentUser?.email || '');

  const statusLabel = isAdmin ? '최고 관리자 권한' :
    (fbMembership.status === 'trial' ? '무료 체험 중' : '구독 중');

  const badge = document.getElementById('sub-status-badge');
  if (badge) badge.textContent = statusLabel;

  const statusText = document.getElementById('sub-status-text');
  if (statusText) statusText.textContent = statusLabel;

  const expiresEl = document.getElementById('sub-expires-date');
  if (expiresEl) {
    if (isAdmin) {
      expiresEl.textContent = '상시 이용 가능 (만료일 없음)';
    } else if (fbMembership.expiresAt) {
      const d = fbMembership.expiresAt;
      expiresEl.textContent =
        `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    } else {
      expiresEl.textContent = '–';
    }
  }

  const priceEl = document.getElementById('sub-price-text');
  if (priceEl) {
    priceEl.textContent = isAdmin
      ? '요금 없음'
      : `월 ${(fbMembership.monthlyPrice || 9900).toLocaleString('ko-KR')}원 (VAT 포함)`;
  }

  const payBtn = document.getElementById('sub-payment-btn');
  if (payBtn && isAdmin) payBtn.style.display = 'none';
}

/* ════════════════════════════════════════
   데이터 내보내기 / 일괄 업로드 (프리미엄 전용)
════════════════════════════════════════ */
async function _loadAllLectures(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'lectures'), where('uid', '==', uid)));
    allLectures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[강비서] 강의 데이터 로드 오류:', err);
    allLectures = [];
  }
}

const _CSV_HEADERS = [
  'ID', '카테고리', '강의명', '현재 회차', '총 회차', '강의 주제',
  '시작 날짜', '종료 날짜', '시작 시간', '종료 시간',
  '회차별 강사료', '총 강사료', '정산 주기', '정산 상태', '진행 상태',
  '온라인 수업', '강의장 주소', '강의실', '수강 인원', '그룹 구성',
  '담당자 이름', '메모',
];

const _esc = v => {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
};

function _isPremiumGated() {
  const isAdmin = SUPER_ADMIN_EMAILS.has(currentUser?.email || '');
  if (isAdmin) return true;
  return fbMembership.status !== 'trial' && fbMembership.status !== 'free' && fbMembership.status !== '';
}

function _showPremiumGateModal() {
  const m = document.getElementById('modal-premium-gate');
    if (!m) return;
    m.style.display = 'flex';
  }

function _triggerCsvDownload(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _downloadTemplate() {
  if (!_isPremiumGated()) {
    _showPremiumGateModal();
    return;
  }
  const csv = '﻿' + _CSV_HEADERS.join(',');
  _triggerCsvDownload(csv, '강비서_강의업로드_양식.csv');
}

function _exportData() {
  if (!_isPremiumGated()) {
    _showPremiumGateModal();
    return;
  }
  const rows = allLectures.map(l => [
    _esc(l.id                 || ''),
    _esc(l.topicTagId         ?? ''),
    _esc(l.title              || ''),
    _esc(l.sessionCurrent     ?? ''),
    _esc(l.sessionTotal       ?? ''),
    _esc(l.topic              || ''),
    _esc(l.date               || ''),
    _esc(l.endDate            || ''),
    _esc(l.timeStart          || ''),
    _esc(l.timeEnd            || ''),
    Number(l.fee              || 0),
    Number(l.feeAmount        || 0),
    _esc(l.settlementCycle    || ''),
    _esc(l.paidStatus         || ''),
    _esc(l.progressStatus     || 'needs_review'),
    _esc(l.isOnline           ?? ''),
    _esc(l.place              || ''),
    _esc(l.classroom          || ''),
    _esc(l.participants       ?? ''),
    _esc(l.groupInfo          || ''),
    _esc(l.managerName        || ''),
    _esc(l.memo               || ''),
  ].join(','));
  const csv = '﻿' + [_CSV_HEADERS.join(','), ...rows].join('\r\n');
  _triggerCsvDownload(csv, '강비서_강의데이터_내보내기.csv');
}

/* ════════════════════════════════════════
   일괄 업로드 — CSV 파싱 & 미리보기 모달
════════════════════════════════════════ */

/* RFC 4180 단일 행 파서 — 이중 인용부호 처리 포함 */
function _parseCsvRow(row) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"')                  { inQuotes = false; }
      else                                  { cur += ch; }
    } else {
      if (ch === '"')  { inQuotes = true; }
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else                 { cur += ch; }
    }
  }
  cells.push(cur);
  return cells;
}

/* 22-column 인덱스 상수 (헤더 순서 기준) */
const _COL = {
  ID: 0, TOPIC_TAG: 1, TITLE: 2, SESSION_CUR: 3, SESSION_TOT: 4, TOPIC: 5,
  DATE: 6, END_DATE: 7, TIME_START: 8, TIME_END: 9,
  FEE: 10, FEE_AMOUNT: 11, SETTLE_CYCLE: 12, PAID_STATUS: 13, PROGRESS: 14,
  IS_ONLINE: 15, PLACE: 16, CLASSROOM: 17, PARTICIPANTS: 18,
  GROUP_INFO: 19, MANAGER: 20, MEMO: 21,
};

let _importRows        = [];   // parsed row objects pending confirmation
let _importErrorIndices = new Set();

function _openImportModal(rows) {
  _importRows        = rows;
  _importErrorIndices = new Set();

  const dupSet = new Set(
    allLectures.map(l => `${l.date || ''}|${l.timeStart || ''}`)
  );

  let newCount = 0, dupCount = 0, errorCount = 0;

  const tbody = document.getElementById('import-preview-tbody');
  if (!tbody) return;

  tbody.innerHTML = rows.map((r, i) => {
    const title     = (r[_COL.TITLE]      || '').trim();
    const date      = (r[_COL.DATE]       || '').trim();
    const timeStart = (r[_COL.TIME_START] || '').trim();
    const feeRaw    = (r[_COL.FEE]        || '').trim();
    const isInvalid = !title || !date || !timeStart || !feeRaw;

    const isDup = !isInvalid && dupSet.has(`${date}|${timeStart}`);

    if (isInvalid) { _importErrorIndices.add(i); errorCount++; }
    else if (isDup)  dupCount++;
    else             newCount++;

    const rowBg = isInvalid ? '#fff1f2' : isDup ? '#fffbeb' : '#fff';
    const badge = isInvalid
      ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:#fee2e2;color:#991b1b;">❌ 오류 - 필수값 누락</span>'
      : isDup
      ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:#fef3c7;color:#92400e;">⚠️ 중복 - 업데이트 예정</span>'
      : '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:#d1fae5;color:#065f46;">✅ 신규 등록 예정</span>';

    const fmtFee = n => {
      const v = Number(n) || 0;
      return v > 0 ? '₩' + v.toLocaleString('ko-KR') : '—';
    };

    const sessionStr = [r[_COL.SESSION_CUR], r[_COL.SESSION_TOT]]
      .filter(Boolean).join(' / ') || '—';

    return `<tr style="background:${rowBg};border-bottom:1px solid #f3f4f6;">
      <td style="padding:9px 12px;color:#9ca3af;">${i + 1}</td>
      <td style="padding:9px 12px;font-weight:600;color:#111827;max-width:180px;
                 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${_escHtml(title)}">${_escHtml(title || '—')}</td>
      <td style="padding:9px 12px;color:#374151;">${_escHtml(sessionStr)}</td>
      <td style="padding:9px 12px;color:#374151;white-space:nowrap;">${_escHtml(date || '—')}</td>
      <td style="padding:9px 12px;color:#374151;white-space:nowrap;">${_escHtml(timeStart || '—')}</td>
      <td style="padding:9px 12px;text-align:right;color:#374151;">${fmtFee(feeRaw)}</td>
      <td style="padding:9px 12px;text-align:right;color:#374151;">${fmtFee(r[_COL.FEE_AMOUNT])}</td>
      <td style="padding:9px 12px;color:#374151;white-space:nowrap;">${_escHtml(r[_COL.PROGRESS] || '—')}</td>
      <td style="padding:9px 12px;">${badge}</td>
    </tr>`;
  }).join('');

  const summary = document.getElementById('import-preview-summary');
  if (summary) {
    summary.textContent = `총 ${rows.length}행 — 신규 ${newCount}건 / 중복 ${dupCount}건` +
      (errorCount > 0 ? ` / ❌ 오류 ${errorCount}건 (파일 수정 필요)` : '');
  }

  const confirmBtn = document.getElementById('btn-confirm-import');
  if (confirmBtn) confirmBtn.disabled = errorCount > 0;

  const modal = document.getElementById('modal-import-preview');
  if (modal) { modal.style.display = 'block'; document.body.style.overflow = 'hidden'; }
}

function _closeImportModal() {
  const modal = document.getElementById('modal-import-preview');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  const inp = document.getElementById('input-import-csv');
  if (inp) inp.value = '';
  _importRows = [];
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initImportCsv() {
  const input = document.getElementById('input-import-csv');
  input?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    if (!_isPremiumGated()) {
      _showPremiumGateModal();
      input.value = '';
      return;
    }

    /* 인코딩 자동 감지: UTF-8 시도 후 깨진 문자 발견 시 EUC-KR 재시도 */
    const _decodeBuffer = buf => {
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      /* 대체 문자(U+FFFD) 또는 흔한 EUC-KR 깨짐 패턴 감지 */
      if (utf8.includes('�') || /[\xC0-\xFF][\x80-\xBF]/.test(utf8)) {
        try { return new TextDecoder('euc-kr', { fatal: true }).decode(buf); } catch (_) {}
      }
      return utf8;
    };

    const reader = new FileReader();
    reader.onload = ev => {
      let text = _decodeBuffer(ev.target.result);
      /* UTF-8 BOM 제거 */
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 2) {
        showToast('데이터가 없거나 헤더만 있는 파일입니다.', 'warn');
        input.value = '';
        return;
      }

      /* 첫 행(헤더) 제외하고 파싱 */
      const rows = lines.slice(1).map(_parseCsvRow);
      _openImportModal(rows);
    };
    reader.readAsArrayBuffer(file);
  });

  /* 닫기 버튼 (헤더 X + 푸터 취소) */
  document.getElementById('btn-cancel-import')?.addEventListener('click', _closeImportModal);
  document.getElementById('btn-cancel-import-footer')?.addEventListener('click', _closeImportModal);

  /* 백드롭 클릭 닫기 */
  document.getElementById('modal-import-preview')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeImportModal();
  });

  document.getElementById('btn-confirm-import')?.addEventListener('click', () => {
    _handleConfirmImport();
  });
}

/* ── 중복 선택 서브 프롬프트 ── */
function _showDupChoicePrompt(dupCount, onUpdate, onSkip, onCancel) {
  const existing = document.getElementById('dup-choice-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'dup-choice-backdrop';
  Object.assign(backdrop.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.55)',
    zIndex: '1400', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  });

  backdrop.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:420px;width:100%;
                padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.3);">
      <h4 style="margin:0 0 8px;font-size:1rem;font-weight:700;color:#111827;">⚠️ 중복 강의 발견</h4>
      <p style="margin:0 0 20px;font-size:0.88rem;color:#4b5563;line-height:1.6;">
        업로드하려는 강의 중 이미 등록된 시간대의 강의가
        <strong>${dupCount}건</strong> 존재합니다. 어떻게 처리할까요?
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button id="dup-btn-update" type="button"
                style="padding:10px 16px;border-radius:8px;border:none;background:#2563c4;
                       color:#fff;font-weight:600;font-size:0.88rem;cursor:pointer;text-align:left;">
          🔄 최신 정보로 업데이트 (Overwrite)
        </button>
        <button id="dup-btn-skip" type="button"
                style="padding:10px 16px;border-radius:8px;border:1px solid #e5e7eb;
                       background:#fff;color:#374151;font-weight:600;font-size:0.88rem;cursor:pointer;text-align:left;">
          ⏭ 중복 강의 건너뛰기 (Skip Duplicates)
        </button>
        <button id="dup-btn-cancel" type="button"
                style="padding:10px 16px;border-radius:8px;border:1px solid #e5e7eb;
                       background:#fff;color:#9ca3af;font-weight:500;font-size:0.88rem;cursor:pointer;text-align:left;">
          취소
        </button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const remove = () => backdrop.remove();
  backdrop.getElementById = id => backdrop.querySelector(`#${id}`);
  backdrop.querySelector('#dup-btn-update').addEventListener('click', () => { remove(); onUpdate(); });
  backdrop.querySelector('#dup-btn-skip').addEventListener('click',   () => { remove(); onSkip();  });
  backdrop.querySelector('#dup-btn-cancel').addEventListener('click', () => { remove(); onCancel(); });
}

/* ── 상태 한→영 매핑 ── */
const _PROGRESS_MAP = {
  '검토 필요': 'needs_review', '진행중': 'scheduled', '완료': 'done',
};
const _PAID_MAP = {
  '대기': 'pending', '완료': 'paid',
};

/* ── CSV 행 → Firestore 페이로드 변환 ── */
function _rowToPayload(r, resolveTagId = () => null) {
  const sessionTotal  = (r[_COL.SESSION_TOT] || '').trim() !== ''
    ? Number(r[_COL.SESSION_TOT]) || null : null;

  /* 강사료: CSV 입력값을 원화 단위 그대로 사용 */
  let fee       = Number(r[_COL.FEE])        || 0;
  let feeAmount = Number(r[_COL.FEE_AMOUNT]) || 0;

  /* 교차 계산 (원화 단위 기준) */
  const totalSessions = Number(sessionTotal || 1);
  if (fee > 0 && feeAmount === 0) feeAmount = fee * totalSessions;
  else if (feeAmount > 0 && fee === 0) fee = Math.round(feeAmount / totalSessions);

  const rawProgress  = (r[_COL.PROGRESS]    || '').trim();
  const rawPaidStatus = (r[_COL.PAID_STATUS] || '').trim();

  return {
    topicTagId:      resolveTagId((r[_COL.TOPIC_TAG] || '').trim()),
    title:           (r[_COL.TITLE]        || '').trim(),
    sessionCurrent:  (r[_COL.SESSION_CUR]  || '').trim() !== ''
      ? Number(r[_COL.SESSION_CUR]) || null : null,
    sessionTotal,
    topic:           (r[_COL.TOPIC]        || '').trim(),
    date:            (r[_COL.DATE]         || '').trim(),
    startDate:       (r[_COL.DATE]         || '').trim(),
    endDate:         (r[_COL.END_DATE]     || '').trim(),
    timeStart:       (r[_COL.TIME_START]   || '').trim(),
    startTime:       (r[_COL.TIME_START]   || '').trim(),
    timeEnd:         (r[_COL.TIME_END]     || '').trim(),
    endTime:         (r[_COL.TIME_END]     || '').trim(),
    fee,
    feeAmount,
    settlementCycle: (r[_COL.SETTLE_CYCLE] || '').trim(),
    paidStatus:      _PAID_MAP[rawPaidStatus]      ?? 'pending',
    progressStatus:  _PROGRESS_MAP[rawProgress]   ?? 'needs_review',
    isOnline:        r[_COL.IS_ONLINE] === 'true' || r[_COL.IS_ONLINE] === true,
    place:           (r[_COL.PLACE]        || '').trim(),
    classroom:       (r[_COL.CLASSROOM]    || '').trim(),
    participants:    (r[_COL.PARTICIPANTS] || '').trim() !== ''
      ? Number(r[_COL.PARTICIPANTS]) || null : null,
    groupInfo:       (r[_COL.GROUP_INFO]   || '').trim(),
    managerName:     (r[_COL.MANAGER]      || '').trim(),
    memo:            (r[_COL.MEMO]         || '').trim(),
  };
}

/* ── Firestore 배치 커밋 (500개 청크 자동 분할) ── */
async function _commitInChunks(ops) {
  const CHUNK = 499;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach(({ ref, data, merge }) => {
      batch.set(ref, data, merge ? { merge: true } : {});
    });
    await batch.commit();
  }
}

/* ── 확정 업로드 진입점 ── */
async function _handleConfirmImport() {
  if (!_importRows.length) return;

  const dupMap = new Map(
    allLectures
      .filter(l => l.id)
      .map(l => [`${l.date || ''}|${l.timeStart || ''}`, l.id])
  );

  const dupRows  = _importRows.filter(r => dupMap.has(`${r[_COL.DATE] || ''}|${r[_COL.TIME_START] || ''}`));
  const newRows  = _importRows.filter(r => !dupMap.has(`${r[_COL.DATE] || ''}|${r[_COL.TIME_START] || ''}`));

  const proceed = async (overwrite) => {
    /* 오류 행 제외 — 원본 배열에서의 인덱스로 판단 */
    const finalRows = (overwrite ? _importRows : newRows)
      .filter(r => !_importErrorIndices.has(_importRows.indexOf(r)));

    if (!finalRows.length) {
      showToast('처리할 강의가 없습니다.', 'info');
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-import');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '업로드 중...'; }

    try {
      /* ── 카테고리 해석 및 신규 생성 ── */
      const newTagMap = new Map(); // 생성된 카테고리 이름 → 새 ID

      const resolveTagId = raw => {
        if (!raw) return null;
        const asNum = Number(raw);
        /* 숫자 ID로 먼저 시도 */
        if (!isNaN(asNum) && asNum > 0) {
          const byId = fbTopics.find(t => t.id === asNum);
          if (byId) return byId.id;
        }
        /* 이름으로 탐색 */
        const byName = fbTopics.find(t => t.name === raw);
        if (byName) return byName.id;
        /* 신규 생성 예약된 이름 */
        if (newTagMap.has(raw)) return newTagMap.get(raw);
        return null;
      };

      /* 알 수 없는 카테고리 이름 수집 */
      finalRows.forEach(r => {
        const raw = (r[_COL.TOPIC_TAG] || '').trim();
        if (!raw) return;
        const asNum = Number(raw);
        const alreadyExists =
          (!isNaN(asNum) && asNum > 0 && fbTopics.some(t => t.id === asNum)) ||
          fbTopics.some(t => t.name === raw);
        if (!alreadyExists && !newTagMap.has(raw)) {
          const newId = topicIdCounter++;
          newTagMap.set(raw, newId);
          fbTopics.push({ id: newId, name: raw, color: '#64748b' });
        }
      });

      /* 신규 카테고리가 생겼으면 Firestore 사용자 문서 갱신 */
      if (newTagMap.size > 0) {
        await setDoc(doc(db, 'users', currentUser.uid), { topicTags: fbTopics }, { merge: true });
        renderTopicTags();
      }

      /* ── Firestore 배치 구성 ── */
      const ops = finalRows.map(r => {
        const key     = `${r[_COL.DATE] || ''}|${r[_COL.TIME_START] || ''}`;
        const existId = dupMap.get(key);
        const isMerge = overwrite && !!existId;
        const ref     = isMerge
          ? doc(db, 'lectures', existId)
          : doc(collection(db, 'lectures'));
        const data = {
          uid: currentUser.uid,
          ..._rowToPayload(r, resolveTagId),
          ...(isMerge ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        };
        return { ref, data, merge: isMerge };
      });

      await _commitInChunks(ops);

      _closeImportModal();
      showToast(`총 ${ops.length}건의 강의 처리가 완료되었습니다!`, 'success');
      await _loadAllLectures(currentUser.uid);
    } catch (err) {
      console.error('[강비서] 일괄 업로드 오류:', err);
      showToast('업로드 중 오류가 발생했습니다.', 'error');
    } finally {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '최종 업로드 완료'; }
    }
  };

  if (dupRows.length > 0) {
    _showDupChoicePrompt(
      dupRows.length,
      () => proceed(true),
      () => proceed(false),
      () => { /* stay on preview modal */ },
    );
  } else {
    await proceed(false);
  }
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
  /* card.innerHTML = `
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
    </div>`;*/
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
   출발지 주소 검색 (Kakao Postcode + Geocoder 검증)
════════════════════════════════════════ */
function initAddressSearch() {
  const slots = [
    { btnId: 'addr-search-home',   inputId: 'address-input-home',   key: 'home'   },
    { btnId: 'addr-search-office', inputId: 'address-input-office', key: 'office' },
    { btnId: 'addr-search-other',  inputId: 'address-input-other',  key: 'other'  },
  ];

  slots.forEach(({ btnId, inputId, key }) => {
    const btn   = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    btn.addEventListener('click', () => {
      if (typeof daum === 'undefined' || !daum.Postcode) {
        showToast('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.', 'error');
        return;
      }

      new daum.Postcode({
        oncomplete: async function (data) {
          const addr = data.roadAddress || data.jibunAddress || '';
          if (!addr) { showToast('카카오맵에서 인식할 수 없는 주소입니다. 다시 선택해주세요.', 'error'); return; }

          const coords = await _geocode(addr);
          if (!coords) {
            input.value = '';
            if (!device.scheduler.addresses) device.scheduler.addresses = { home: '', office: '', other: '' };
            device.scheduler.addresses[key] = '';
            showToast('카카오맵에서 인식할 수 없는 주소입니다. 다시 선택해주세요.', 'error');
            return;
          }

          input.value = addr;
          if (!device.scheduler.addresses) device.scheduler.addresses = { home: '', office: '', other: '' };
          device.scheduler.addresses[key] = addr;
        },
      }).open();
    });
  });
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
        // 프로필
        slogan:    getVal('profile-slogan'),
        bio:       getVal('profile-bio'),
        nickname,
        tel:       getVal('prof-tel').trim(),
        keywords:  fbKeywords,
        topicTags: fbTopics,
        // 스케줄러 설정
        setupTime:     device.scheduler.setupTime,
        wrapupTime:    device.scheduler.wrapupTime,
        bufferTime:    device.scheduler.bufferTime === 'custom'
          ? (device.scheduler.bufferCustom || 45)
          : (device.scheduler.bufferTime   || 30),
        bufferIsCustom: device.scheduler.bufferTime === 'custom',
        addresses: {
          home:   device.scheduler.addresses?.home   || '',
          office: device.scheduler.addresses?.office || '',
          other:  device.scheduler.addresses?.other  || '',
        },
        defaultOriginType: device.scheduler.defaultOriginType || 'home',
        // 정산 설정 (기기 간 동기화)
        hourlyRate:    device.settlement.hourlyRate    || 0,
        bankName:      device.settlement.bankName      || '',
        accountNumber: device.settlement.accountNumber || '',
        accountHolder: device.settlement.accountHolder || '',
        updatedAt:     serverTimestamp(),
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
  if (!device.scheduler.addresses) device.scheduler.addresses = { home: '', office: '', other: '' };
  const homeEl   = document.getElementById('address-input-home');
  const officeEl = document.getElementById('address-input-office');
  const otherEl  = document.getElementById('address-input-other');
  if (homeEl)   device.scheduler.addresses.home   = homeEl.value.trim();
  if (officeEl) device.scheduler.addresses.office = officeEl.value.trim();
  if (otherEl)  device.scheduler.addresses.other  = otherEl.value.trim();
  const checkedOrigin = document.querySelector('input[name="default-origin"]:checked');
  if (checkedOrigin) device.scheduler.defaultOriginType = checkedOrigin.value;

  device.settlement.hourlyRate    = Number(getVal('hourly-rate')) || 0;
  device.settlement.bankName      = getVal('bank-name');
  device.settlement.accountNumber = getVal('account-number');
  device.settlement.accountHolder = getVal('account-holder');
}

// uid 필드가 현재 로그인한 사용자의 uid와 일치하는 문서만 찾아서 삭제
async function deleteUserLectures() {
  const user = window.auth?.currentUser;
  if (!user) return window.showToast?.('로그인이 필요합니다.', 'error');

  if (!confirm("⚠️ 정말로 본인이 등록한 모든 강의 및 투두리스트 등을 삭제하시겠습니까?")) return;
  if (!confirm("🚨 삭제된 데이터는 절대로 복구할 수 없습니다. 진행할까요?")) return;

  const getTools = () => {
        return new Promise((resolve) => {
            let attempts = 0;
            const interval = setInterval(() => {
                const tools = window.FirebaseFirestore;
                attempts++;
                if (tools || attempts > 30) { // 0.1초씩 30번 = 3초
                    clearInterval(interval);
                    resolve(tools);
                }
            }, 100);
        });
    };

    const FStore = await getTools();

    if (!FStore || !FStore.query) {
        console.error('[강비서] 도구 상자 로드 실패:', window.FirebaseFirestore);
        return window.showToast?.('시스템 로딩 중입니다. 잠시 후 다시 클릭해주세요.', 'error');
    }

    if (!confirm("⚠️ 정말로 본인이 등록한 모든 데이터를 삭제하시겠습니까?")) return;
    if (!confirm("🚨 삭제된 데이터는 절대로 복구할 수 없습니다. 진행할까요?")) return;

    try {
        const db = window._temp_db;
        const col = window._temp_collection;

        console.log("[강비서] 전체 삭제 프로세스 시작...");
        const qLectures = FStore.query(col(db, 'lectures'), FStore.where('uid', '==', user.uid));
        const qTodos = FStore.query(col(db, 'todos'), FStore.where('uid', '==', user.uid));

        const [snapLectures, snapTodos] = await Promise.all([
            FStore.getDocs(qLectures),
            FStore.getDocs(qTodos)
        ]);

        const totalCount = snapLectures.size + snapTodos.size;

        if (totalCount === 0) {
            return window.showToast?.('삭제할 데이터가 없습니다.', 'info');
        }

        // 2. 삭제할 약속(Promise)들을 하나의 배열로 합침
        const deletePromises = [
            ...snapLectures.docs.map(d => FStore.deleteDoc(FStore.doc(db, 'lectures', d.id))),
            ...snapTodos.docs.map(d => FStore.deleteDoc(FStore.doc(db, 'todos', d.id)))
        ];
        
        // 3. 모든 데이터 삭제 실행
        await Promise.all(deletePromises);

        window.showToast?.(`총 ${totalCount}건(강의/투두) 삭제 완료!`, 'success');

        setTimeout(() => location.reload(), 1000);
    } catch (err) {
        console.error('[강비서] 삭제 오류:', err);
        window.showToast?.('삭제 중 오류가 발생했습니다.', 'error');
    }
}

window.deleteUserLectures = deleteUserLectures;

/* ════════════════════════════════════════
   인증 상태 감지 — 진입점
════════════════════════════════════════ */
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
  initAddressSearch();
  initSettlement();
  initTopics();
  initSubscription();
  initFloatingSave();
  initGcalImport();

  await _loadAllLectures(user.uid);
  document.getElementById('btn-download-template')?.addEventListener('click', _downloadTemplate);
  document.getElementById('btn-export-data')?.addEventListener('click', _exportData);
  initImportCsv();

  /* 프리미엄 게이트 모달 닫기 */
  const _pgModal = document.getElementById('modal-premium-gate');
  document.getElementById('btn-premium-gate-close')?.addEventListener('click', () => {
    if (_pgModal) _pgModal.style.display = 'none';
  });
    _pgModal?.addEventListener('click', e => {
    if (e.target === _pgModal) _pgModal.style.display = 'none';
  });

});
