/* js/pages/mypage.js — 마이 페이지 동작 로직 */

'use strict';

// ════════════════════════════════
//  STATE: 기본값 + localStorage 로드
// ════════════════════════════════
const DEFAULT_SETTINGS = {
  profile: {
    name: '김지수',
    email: 'jisu.kim@example.com',
    slogan: '성장을 돕는 퍼실리테이터',
    bio: '기업 교육 전문 강사로 리더십, 조직문화, 커뮤니케이션 분야에서 10년간 활동하고 있습니다.',
    keywords: ['기업교육', '리더십', 'HRD', '퍼실리테이션'],
    photoDataUrl: null,
  },
  scheduler: {
    transport: 'car',
    bufferTime: 30,
    bufferCustom: 45,
    setupTime: 20,
    parkingAlert: true,
  },
  settlement: {
    hourlyRate: 300000,
    bankName: '국민은행',
    accountNumber: '123-456789-01-234',
    accountHolder: '김지수',
    docs: {
      bizreg: null,
      bankbook: null,
      idcard: null,
    },
  },
  topics: [
    { id: 1, name: '경영·리더십', color: '#2563c4' },
    { id: 2, name: 'HRD', color: '#059669' },
    { id: 3, name: '커뮤니케이션', color: '#7c3aed' },
    { id: 4, name: '조직문화', color: '#d97706' },
  ],
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('kangbiseo_mypage');
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return JSON.parse(raw);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

function saveSettings(settings) {
  // docs는 파일 객체라 직렬화 불가 → dataUrl 상태만 저장
  localStorage.setItem('kangbiseo_mypage', JSON.stringify(settings));
}

let settings = loadSettings();
let selectedTopicColor = '#2563c4';
let topicIdCounter = Math.max(0, ...settings.topics.map(t => t.id)) + 1;


// common.js handles sidebar, topbar date, and window.showToast


// ════════════════════════════════
//  섹션 내비: 스크롤 + 활성 상태
// ════════════════════════════════
function initSectionNav() {
  const navItems = document.querySelectorAll('.mypage-nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // IntersectionObserver로 스크롤 위치에 따라 nav 활성화
  const sections = document.querySelectorAll('.mypage-card[id]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navItems.forEach(nav => nav.classList.remove('active'));
        const active = document.querySelector(`.mypage-nav-item[data-target="${entry.target.id}"]`);
        active?.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  sections.forEach(sec => observer.observe(sec));
}


// ════════════════════════════════
//  SECTION 1: 프로필
// ════════════════════════════════
function initProfile() {
  const s = settings.profile;

  // 필드 초기값
  setVal('profile-name', s.name);
  setVal('profile-email', s.email);
  setVal('profile-slogan', s.slogan);
  setVal('profile-bio', s.bio);

  // 사이드바 이름 반영
  const sbName = document.getElementById('sidebar-user-name');
  if (sbName) sbName.textContent = `${s.name} 강사`;

  // 아바타 이니셜
  updateAvatarInitial(s.name);

  // 프로필 사진 복원
  if (s.photoDataUrl) {
    showProfilePhoto(s.photoDataUrl);
  }

  // 키워드 칩 렌더링
  renderKeywordChips();

  // 사진 업로드
  const photoInput = document.getElementById('profile-photo-input');
  photoInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('파일 크기는 5MB 이하여야 합니다.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      settings.profile.photoDataUrl = ev.target.result;
      showProfilePhoto(ev.target.result);
    };
    reader.readAsDataURL(file);
  });

  // 키워드 입력 — Enter / 쉼표
  const kwInput = document.getElementById('keyword-input');
  kwInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(kwInput.value);
    }
  });
  kwInput?.addEventListener('blur', () => {
    if (kwInput.value.trim()) addKeyword(kwInput.value);
  });

  // 칩 행 클릭 시 인풋 포커스
  document.getElementById('keyword-chip-row')?.addEventListener('click', () => {
    kwInput?.focus();
  });
}

function showProfilePhoto(dataUrl) {
  const initial = document.getElementById('profile-photo-initial');
  const img = document.getElementById('profile-photo-img');
  if (initial) initial.style.display = 'none';
  if (img) {
    img.src = dataUrl;
    img.style.display = 'block';
  }
}

function updateAvatarInitial(name) {
  const el = document.getElementById('sidebar-avatar');
  if (el && name) el.textContent = name[0];
  const initial = document.getElementById('profile-photo-initial');
  if (initial && name && !settings.profile.photoDataUrl) {
    initial.textContent = name[0];
  }
}

function renderKeywordChips() {
  const row = document.getElementById('keyword-chip-row');
  const input = document.getElementById('keyword-input');
  if (!row || !input) return;

  // 기존 칩 제거 (인풋 제외)
  row.querySelectorAll('.keyword-chip').forEach(c => c.remove());

  settings.profile.keywords.forEach(kw => {
    const chip = document.createElement('span');
    chip.className = 'keyword-chip';
    chip.innerHTML = `${escHtml(kw)}<button class="keyword-chip-del" type="button" aria-label="${escHtml(kw)} 삭제">×</button>`;
    chip.querySelector('.keyword-chip-del').addEventListener('click', () => {
      settings.profile.keywords = settings.profile.keywords.filter(k => k !== kw);
      renderKeywordChips();
    });
    row.insertBefore(chip, input);
  });
}

function addKeyword(raw) {
  const kw = raw.replace(/,/g, '').trim();
  const input = document.getElementById('keyword-input');
  if (!kw || settings.profile.keywords.includes(kw)) {
    if (input) input.value = '';
    return;
  }
  if (settings.profile.keywords.length >= 10) {
    showToast('키워드는 최대 10개까지 추가할 수 있습니다.', 'warn');
    return;
  }
  settings.profile.keywords.push(kw);
  renderKeywordChips();
  if (input) input.value = '';
}


// ════════════════════════════════
//  SECTION 2: 스케줄러
// ════════════════════════════════
function initScheduler() {
  const s = settings.scheduler;

  // 이동 수단
  setTransport(s.transport);
  document.querySelectorAll('.transport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTransport(btn.dataset.transport);
    });
  });

  // 버퍼 타임 라디오
  const bufVal = s.bufferTime === 'custom' ? 'custom' : String(s.bufferTime);
  const bufRadio = document.querySelector(`input[name="buffer-time"][value="${bufVal}"]`);
  if (bufRadio) bufRadio.checked = true;
  toggleCustomBuffer(bufVal === 'custom');

  document.querySelectorAll('input[name="buffer-time"]').forEach(radio => {
    radio.addEventListener('change', () => {
      toggleCustomBuffer(radio.value === 'custom');
    });
  });

  // 버퍼 직접 입력
  const customInput = document.getElementById('buffer-custom-value');
  if (customInput) customInput.value = s.bufferCustom;

  // 준비 시간 라디오
  const setupRadio = document.querySelector(`input[name="setup-time"][value="${s.setupTime}"]`);
  if (setupRadio) setupRadio.checked = true;

  // 주차 알림 토글
  const parkingCb = document.getElementById('parking-alert');
  if (parkingCb) parkingCb.checked = s.parkingAlert;

  updateParkingRow(s.transport);
}

function setTransport(value) {
  settings.scheduler.transport = value;
  document.querySelectorAll('.transport-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.transport === value);
  });
  updateParkingRow(value);
}

function updateParkingRow(transport) {
  const row = document.getElementById('parking-toggle-row');
  if (!row) return;
  row.style.opacity = transport === 'car' ? '1' : '0.4';
  row.style.pointerEvents = transport === 'car' ? '' : 'none';
}

function toggleCustomBuffer(show) {
  const wrap = document.getElementById('buffer-custom-wrap');
  if (wrap) wrap.classList.toggle('hidden', !show);
}


// ════════════════════════════════
//  SECTION 3: 정산 & 행정
// ════════════════════════════════
function initSettlement() {
  const s = settings.settlement;

  setVal('hourly-rate', s.hourlyRate);
  setVal('bank-name', s.bankName);
  setVal('account-number', s.accountNumber);
  setVal('account-holder', s.accountHolder);

  updateFeeDisplay(s.hourlyRate);

  document.getElementById('hourly-rate')?.addEventListener('input', e => {
    updateFeeDisplay(Number(e.target.value));
  });

  // Quick-Docs: 저장된 상태 복원
  Object.entries(s.docs).forEach(([key, val]) => {
    if (val) markDocUploaded(key, val);
  });

  // 파일 인풋 이벤트
  document.querySelectorAll('.doc-upload-input').forEach(input => {
    input.addEventListener('change', e => {
      const file = e.target.files[0];
      const key = input.dataset.doc;
      if (!file || !key) return;
      settings.settlement.docs[key] = file.name;
      markDocUploaded(key, file.name);
    });
  });

  // 삭제 버튼
  document.querySelectorAll('.doc-upload-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.doc;
      settings.settlement.docs[key] = null;
      const inputEl = document.getElementById(`doc-input-${key}`);
      if (inputEl) inputEl.value = '';
      unmarkDocUploaded(key);
    });
  });
}

function updateFeeDisplay(val) {
  const display = document.getElementById('fee-display');
  if (!display) return;
  const num = Number(val) || 0;
  display.textContent = `= 시간당 ${num.toLocaleString('ko-KR')}원`;
}

function markDocUploaded(key, filename) {
  const card = document.getElementById(`doc-card-${key}`);
  const status = document.getElementById(`doc-status-${key}`);
  if (card) card.classList.add('uploaded');
  if (status) status.textContent = filename;
}

function unmarkDocUploaded(key) {
  const card = document.getElementById(`doc-card-${key}`);
  const status = document.getElementById(`doc-status-${key}`);
  if (card) card.classList.remove('uploaded');
  if (status) status.textContent = '미등록';
}


// ════════════════════════════════
//  SECTION 4: 강의 주제 태그
// ════════════════════════════════
function initTopics() {
  renderTopicTags();

  // 컬러 프리셋 선택
  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTopicColor = btn.dataset.color;
    });
  });

  // 태그 추가 버튼
  document.getElementById('topic-add-btn')?.addEventListener('click', addTopicTag);

  // Enter 키
  document.getElementById('topic-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTopicTag();
    }
  });
}

function renderTopicTags() {
  const list = document.getElementById('topic-tag-list');
  if (!list) return;
  list.innerHTML = '';

  if (settings.topics.length === 0) {
    list.innerHTML = '<span style="color:var(--color-text-muted);font-size:var(--font-size-sm);">아직 추가된 태그가 없습니다. 아래에서 추가해 보세요.</span>';
    return;
  }

  settings.topics.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'topic-tag';
    el.style.background = tag.color;
    el.setAttribute('role', 'listitem');
    el.innerHTML = `
      <span class="topic-tag-text">${escHtml(tag.name)}</span>
      <button type="button" class="topic-tag-del" aria-label="${escHtml(tag.name)} 태그 삭제">×</button>
    `;
    el.querySelector('.topic-tag-del').addEventListener('click', () => {
      settings.topics = settings.topics.filter(t => t.id !== tag.id);
      renderTopicTags();
    });
    list.appendChild(el);
  });
}

function addTopicTag() {
  const input = document.getElementById('topic-add-input');
  const name = input?.value.trim();
  if (!name) {
    input?.focus();
    return;
  }
  if (settings.topics.some(t => t.name === name)) {
    showToast('이미 존재하는 태그입니다.', 'warn');
    return;
  }
  if (settings.topics.length >= 20) {
    showToast('태그는 최대 20개까지 추가할 수 있습니다.', 'warn');
    return;
  }
  settings.topics.push({ id: topicIdCounter++, name, color: selectedTopicColor });
  renderTopicTags();
  if (input) input.value = '';
}


// ════════════════════════════════
//  SECTION 5: 구독 (정적 UI)
// ════════════════════════════════
function initSubscription() {
  document.getElementById('plan-upgrade-btn')?.addEventListener('click', () => {
    showToast('플랜 변경 페이지는 준비 중입니다.', 'info');
  });

  document.getElementById('billing-cancel-btn')?.addEventListener('click', () => {
    showToast('구독 취소 기능은 준비 중입니다.', 'info');
  });

  document.getElementById('billing-method-btn')?.addEventListener('click', () => {
    showToast('결제 수단 변경 기능은 준비 중입니다.', 'info');
  });
}


// ════════════════════════════════
//  FLOATING SAVE
// ════════════════════════════════
function initFloatingSave() {
  const btn = document.getElementById('floating-save-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    collectFormValues();
    saveSettings(settings);

    // 사이드바 이름 동기화
    const sbName = document.getElementById('sidebar-user-name');
    if (sbName) sbName.textContent = `${settings.profile.name} 강사`;
    updateAvatarInitial(settings.profile.name);

    // 저장 완료 애니메이션
    btn.classList.add('saved');
    btn.innerHTML = '<span class="floating-save-icon">✅</span> 저장 완료!';
    setTimeout(() => {
      btn.classList.remove('saved');
      btn.innerHTML = '<span class="floating-save-icon">💾</span> 저장하기';
    }, 2200);

    showToast('설정이 저장되었습니다.', 'success');
  });
}

function collectFormValues() {
  // 프로필
  settings.profile.name = getVal('profile-name');
  settings.profile.email = getVal('profile-email');
  settings.profile.slogan = getVal('profile-slogan');
  settings.profile.bio = getVal('profile-bio');

  // 스케줄러
  const bufRadio = document.querySelector('input[name="buffer-time"]:checked');
  if (bufRadio) {
    if (bufRadio.value === 'custom') {
      settings.scheduler.bufferTime = 'custom';
      settings.scheduler.bufferCustom = Number(getVal('buffer-custom-value')) || 45;
    } else {
      settings.scheduler.bufferTime = Number(bufRadio.value);
    }
  }
  const setupRadio = document.querySelector('input[name="setup-time"]:checked');
  if (setupRadio) settings.scheduler.setupTime = Number(setupRadio.value);

  const parkingCb = document.getElementById('parking-alert');
  if (parkingCb) settings.scheduler.parkingAlert = parkingCb.checked;

  // 정산
  settings.settlement.hourlyRate = Number(getVal('hourly-rate')) || 0;
  settings.settlement.bankName = getVal('bank-name');
  settings.settlement.accountNumber = getVal('account-number');
  settings.settlement.accountHolder = getVal('account-holder');
}


// Toast: delegate to common.js window.showToast
function showToast(message, type = 'info') {
  const typeMap = { success: 'success', error: 'error', warn: 'default', info: 'default' };
  window.showToast?.(message, typeMap[type] || 'default');
}


// ════════════════════════════════
//  유틸
// ════════════════════════════════
function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = val ?? '';
}

function getVal(id) {
  return document.getElementById(id)?.value ?? '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ════════════════════════════════
//  INIT
// ════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initSectionNav();
  initProfile();
  initScheduler();
  initSettlement();
  initTopics();
  initSubscription();
  initFloatingSave();
});
