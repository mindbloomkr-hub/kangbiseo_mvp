// js/pages/mypage.js — 마이 페이지 (Firebase Auth + Firestore 연동, ES Module)

import { auth, db } from '../api.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

/* ════════════════════════════════════════
   기기 전용 설정 (스케줄러·정산) — localStorage
════════════════════════════════════════ */
const DEFAULT_DEVICE = {
  scheduler: {
    transport:    'car',
    bufferTime:   30,
    bufferCustom: 45,
    setupTime:    20,
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
      setVal('profile-slogan', d.slogan || '');
      setVal('profile-bio',    d.bio    || '');
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

  /* 사이드바 */
  const displayName = user.displayName || '강사';
  const sbName = document.getElementById('sidebar-user-name');
  if (sbName) sbName.textContent = `${displayName} 강사`;
  updateAvatarInitial(displayName);

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
  const sbAvatar = document.getElementById('sidebar-avatar');
  if (sbAvatar && name) sbAvatar.textContent = name[0];
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
    chip.innerHTML = `${escHtml(kw)}<button class="keyword-chip-del" type="button" aria-label="${escHtml(kw)} 삭제">×</button>`;
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
  const setupRadio = document.querySelector(`input[name="setup-time"][value="${s.setupTime}"]`);
  if (setupRadio) setupRadio.checked = true;
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
    el.innerHTML = `<span class="topic-tag-text">${escHtml(tag.name)}</span>
      <button type="button" class="topic-tag-del" aria-label="${escHtml(tag.name)} 삭제">×</button>`;
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
      await setDoc(doc(db, 'users', currentUser.uid), {
        slogan:    getVal('profile-slogan'),
        bio:       getVal('profile-bio'),
        keywords:  fbKeywords,
        topics:    fbTopics,
        updatedAt: serverTimestamp(),
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
  const setupRadio = document.querySelector('input[name="setup-time"]:checked');
  if (setupRadio) device.scheduler.setupTime = Number(setupRadio.value);
  const parkingCb = document.getElementById('parking-alert');
  if (parkingCb)  device.scheduler.parkingAlert = parkingCb.checked;

  device.settlement.hourlyRate    = Number(getVal('hourly-rate')) || 0;
  device.settlement.bankName      = getVal('bank-name');
  device.settlement.accountNumber = getVal('account-number');
  device.settlement.accountHolder = getVal('account-holder');
}

/* ════════════════════════════════════════
   유틸
════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const map = { success: 'success', error: 'error', warn: 'default', info: 'default' };
  window.showToast?.(msg, map[type] || 'default');
}

function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val ?? ''; }
function getVal(id)       { return document.getElementById(id)?.value ?? ''; }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════
   인증 상태 감지 — 진입점
════════════════════════════════════════ */
initNavBadge();
initSectionNav();

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace('../login.html');
    return;
  }
  currentUser = user;
  localStorage.setItem('userName',  user.displayName || '');
  localStorage.setItem('userEmail', user.email       || '');

  initProfile(user);
  await loadFirebaseProfile(user.uid);
  renderKeywordChips();
  renderTopicTags();

  initScheduler();
  initSettlement();
  initTopics();
  initSubscription();
  initFloatingSave();
});
