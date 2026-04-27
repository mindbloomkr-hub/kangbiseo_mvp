// js/pages/login.js — Firebase Auth 연동 (module)

import { auth, db, googleProvider } from '../api.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

/* ════════════════════════════════════════
   이미 로그인된 사용자 → 홈으로 리다이렉트
════════════════════════════════════════ */
onAuthStateChanged(auth, user => {
  if (user) window.location.replace('pages/home.html');
});

/* ════════════════════════════════════════
   DOM 참조
════════════════════════════════════════ */
const tabBtns    = document.querySelectorAll('.auth-tab-btn');
const loginForm  = document.getElementById('form-login');
const signupForm = document.getElementById('form-signup');
const formHeader = document.getElementById('form-header');

/* ════════════════════════════════════════
   탭 전환 (로그인 ↔ 회원가입)
════════════════════════════════════════ */
const HEADER_COPY = {
  login:  { title: '다시 오셨군요, 반갑습니다 👋',  sub: '강의 일정과 정산 현황을 확인하세요.' },
  signup: { title: '강비서와 함께 시작하세요',        sub: '30일 무료 체험, 카드 등록 불필요.' },
};

function switchTab(targetTab) {
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === targetTab);
    btn.setAttribute('aria-selected', btn.dataset.tab === targetTab);
  });
  loginForm.classList.toggle('active', targetTab === 'login');
  signupForm.classList.toggle('active', targetTab === 'signup');

  const copy = HEADER_COPY[targetTab];
  formHeader.querySelector('.form-header-title').textContent = copy.title;
  formHeader.querySelector('.form-header-sub').textContent   = copy.sub;

  history.replaceState(null, '', `#${targetTab}`);
}

tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

(function initTab() {
  const hash = location.hash.replace('#', '');
  switchTab(hash === 'signup' ? 'signup' : 'login');
})();

/* ════════════════════════════════════════
   비밀번호 표시/숨김 토글
════════════════════════════════════════ */
document.querySelectorAll('.input-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const isHidden  = input.type === 'password';
    input.type      = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
    btn.setAttribute('aria-label', isHidden ? '비밀번호 숨기기' : '비밀번호 표시');
  });
});

/* ════════════════════════════════════════
   비밀번호 강도 측정
════════════════════════════════════════ */
const pwInput   = document.getElementById('signup-pw');
const pwFill    = document.getElementById('pw-strength-fill');
const pwStrText = document.getElementById('pw-strength-text');
const STRENGTH_LABELS = ['', '취약한 비밀번호', '보통 비밀번호', '양호한 비밀번호', '강력한 비밀번호'];

function measurePasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)           score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

pwInput?.addEventListener('input', () => {
  const level = measurePasswordStrength(pwInput.value);
  if (!pwInput.value) {
    pwFill.removeAttribute('data-level');
    pwStrText.textContent = '';
  } else {
    pwFill.dataset.level  = level;
    pwStrText.textContent = STRENGTH_LABELS[level] ?? '';
  }
});

/* ════════════════════════════════════════
   유효성 검사
════════════════════════════════════════ */
const VALIDATORS = {
  userId:   v => /^[a-zA-Z0-9_]{4,20}$/.test(v) ? null : '영문·숫자만 사용, 4~20자 이내로 입력해 주세요.',
  email:    v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : '올바른 이메일 형식을 입력해 주세요.',
  tel:      v => /^01[0-9]{8,9}$/.test(v.replace(/-/g, '')) ? null : '올바른 휴대폰 번호를 입력해 주세요.',
  name:     v => v.trim().length >= 2 ? null : '이름은 2자 이상 입력해 주세요.',
  password: v => v.length >= 8 ? null : '비밀번호는 8자 이상이어야 합니다.',
};

function validateField(input, type) {
  const errorEl = document.getElementById(`${input.id}-error`);
  const error   = VALIDATORS[type]?.(input.value);
  if (error) {
    input.classList.add('is-error');
    input.classList.remove('is-success');
    if (errorEl) errorEl.textContent = error;
    return false;
  }
  input.classList.remove('is-error');
  if (input.value) input.classList.add('is-success');
  if (errorEl) errorEl.textContent = '';
  return true;
}

const fieldMap = [
  { id: 'signup-userid', type: 'userId'   },
  { id: 'signup-name',   type: 'name'     },
  { id: 'signup-email',  type: 'email'    },
  { id: 'signup-tel',    type: 'tel'      },
  { id: 'signup-pw',     type: 'password' },
];

fieldMap.forEach(({ id, type }) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur',  () => validateField(el, type));
  el.addEventListener('input', () => {
    if (el.classList.contains('is-error')) validateField(el, type);
  });
});

/* ════════════════════════════════════════
   로그인 폼 제출 — Firebase signIn
════════════════════════════════════════ */
loginForm?.addEventListener('submit', async e => {
  e.preventDefault();

  const email = document.getElementById('login-id').value.trim();
  const pw    = document.getElementById('login-pw').value;

  if (!email || !pw) {
    showToast('이메일과 비밀번호를 입력해 주세요.', 'error');
    return;
  }

  showToast('로그인 중입니다...', 'default');

  try {
    await signInWithEmailAndPassword(auth, email, pw);
    window.location.href = 'pages/home.html';
  } catch (err) {
    console.error('[강비서] 로그인 오류:', err.code);
    const MESSAGES = {
      'auth/user-not-found':     '등록되지 않은 이메일입니다.',
      'auth/wrong-password':     '비밀번호가 올바르지 않습니다.',
      'auth/invalid-email':      '올바른 이메일 형식을 입력해 주세요.',
      'auth/invalid-credential': '이메일 또는 비밀번호를 확인해 주세요.',
      'auth/too-many-requests':  '잠시 후 다시 시도해 주세요.',
    };
    showToast(MESSAGES[err.code] ?? '로그인에 실패했습니다.', 'error');
  }
});

/* ════════════════════════════════════════
   회원가입 폼 제출 — Firebase createUser
════════════════════════════════════════ */
signupForm?.addEventListener('submit', async e => {
  e.preventDefault();

  const results = fieldMap.map(({ id, type }) => {
    const el = document.getElementById(id);
    return el ? validateField(el, type) : true;
  });

  const agreeEl = document.getElementById('signup-agree');
  if (!agreeEl?.checked) {
    showToast('이용약관 및 개인정보처리방침에 동의해 주세요.', 'error');
    return;
  }

  if (results.some(v => !v)) {
    showToast('입력 항목을 다시 확인해 주세요.', 'error');
    return;
  }

  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw    = document.getElementById('signup-pw').value;

  showToast('가입을 처리 중입니다...', 'default');

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: name });
    /* [6] Firestore에 사용자 프로필 문서 초기 생성 */
    await setDoc(doc(db, 'users', cred.user.uid), {
      displayName: name,
      email,
      nickname:   '',
      keywords:   [],
      topics:     [],
      createdAt:  serverTimestamp(),
    }, { merge: true });
    window.location.href = 'pages/home.html';
  } catch (err) {
    console.error('[강비서] 회원가입 오류:', err.code);
    const MESSAGES = {
      'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
      'auth/invalid-email':        '올바른 이메일 형식을 입력해 주세요.',
      'auth/weak-password':        '비밀번호가 너무 약합니다. (6자 이상)',
    };
    showToast(MESSAGES[err.code] ?? '회원가입에 실패했습니다.', 'error');
  }
});

/* ════════════════════════════════════════
   구글 로그인
════════════════════════════════════════ */
document.getElementById('btn-google-login')?.addEventListener('click', async () => {
  try {
    const result     = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      sessionStorage.setItem('gcal_token', credential.accessToken);
    }
    window.location.href = 'pages/home.html';
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      console.error('[강비서] 구글 로그인 오류:', err.code);
      showToast('구글 로그인에 실패했습니다.', 'error');
    }
  }
});

/* 카카오 로그인 (미구현) */
document.getElementById('btn-kakao-login')?.addEventListener('click', () => {
  showToast('카카오 로그인은 준비 중입니다.', 'default');
});

/* ════════════════════════════════════════
   폼 전환 링크
════════════════════════════════════════ */
document.getElementById('switch-to-signup')?.addEventListener('click', e => {
  e.preventDefault();
  switchTab('signup');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('switch-to-login')?.addEventListener('click', e => {
  e.preventDefault();
  switchTab('login');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ════════════════════════════════════════
   전화번호 자동 하이픈
════════════════════════════════════════ */
document.getElementById('signup-tel')?.addEventListener('input', function () {
  const digits = this.value.replace(/\D/g, '').slice(0, 11);
  if      (digits.length < 4) this.value = digits;
  else if (digits.length < 8) this.value = `${digits.slice(0,3)}-${digits.slice(3)}`;
  else                        this.value = `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
});

/* ════════════════════════════════════════
   Toast 알림
════════════════════════════════════════ */
let toastTimer = null;

function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className   = 'toast show';
  if (type === 'error')   toast.classList.add('toast--error');
  if (type === 'success') toast.classList.add('toast--success');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
