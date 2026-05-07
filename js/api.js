// js/api.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js';
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-storage.js';
import { loadSidebar, loadModal, updateSidebarUI } from './utils.js';

const firebaseConfig = {
  apiKey:            'AIzaSyDfM4zUHipTiWf5GlSij5CsWnh6W8zKFLM',
  authDomain:        'kang-biseo.firebaseapp.com',
  projectId:         'kang-biseo',
  storageBucket:     'kang-biseo.firebasestorage.app',
  messagingSenderId: '367524528112',
  appId:             '1:367524528112:web:b93350e80b9ec2c428a735',
  measurementId:     'G-Z29RMHZMZV',
};

const app = initializeApp(firebaseConfig);

export const auth           = getAuth(app);
window.auth = auth;
export const db             = getFirestore(app);
export const storage        = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('email profile openid');
//googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');

/* ════════════════════════════════════════
   Firebase Storage — 프로필 사진 업로드
════════════════════════════════════════ */
export async function uploadProfilePhoto(uid, file) {
  const photoRef = ref(storage, `users/${uid}/profile`);
  await uploadBytes(photoRef, file);
  return getDownloadURL(photoRef);
}

/* ════════════════════════════════════════
   Firestore — 사용자 프로필 동기화
   모든 페이지에서 최신 사용자 데이터를 한 번에 가져올 때 사용
════════════════════════════════════════ */
export async function syncUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

/* ════════════════════════════════════════
   구글 캘린더 API
════════════════════════════════════════ */
export async function fetchGoogleCalendarEvents() {
  const token = sessionStorage.getItem('gcal_token');
  if (!token) {
    console.warn('[강비서] gcal_token 없음 — 구글 계정으로 재로그인이 필요합니다.');
    return null;
  }

  const now     = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString();

  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime' });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`캘린더 API ${res.status}: ${JSON.stringify(errBody)}`);
  }
  return (await res.json()).items ?? [];
}

/* ════════════════════════════════════════
   공통 Firestore 강의 구독
════════════════════════════════════════ */
export function subscribeLectures(uid, callback, onError) {
  const q = query(collection(db, 'lectures'), where('uid', '==', uid));
  return onSnapshot(q, callback, onError);
}

/* ════════════════════════════════════════
   공통 인증 가드 (사이드바·모달 로드 + 닉네임 반영 통합)

   opts.withModal  — true: components/modal.html 동적 주입
   opts.cleanupFn  — 로그아웃 시 실행할 정리 함수 (unsubscribe 등)
════════════════════════════════════════ */
export function authGuard(onUserLogged, { withModal = false, cleanupFn } = {}) {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.replace('../login.html'); return; }

    localStorage.setItem('userName',  user.displayName || '강사');
    localStorage.setItem('userUid',   user.uid);
    localStorage.setItem('userEmail', user.email || '');

    // 1. 공통 사이드바 로드 (inject + behavior init + active nav)
    await loadSidebar();

    // 2. 강의 모달 HTML 로드 (필요한 페이지만)
    if (withModal) await loadModal();

    // 3. 로그아웃 버튼 — 사이드바 inject 이후에만 바인딩 가능
    _bindLogout(cleanupFn);

    // 4. 닉네임: 캐시 우선 표시 → Firestore 최신값으로 갱신
    const cached = localStorage.getItem('userNickname') || user.displayName || '강사';
    updateSidebarUI(cached);

    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (!snap.exists()) return;
      const nick = snap.data().nickname || '';
      if (nick) { localStorage.setItem('userNickname', nick); updateSidebarUI(nick); }
      else      localStorage.removeItem('userNickname');
    }).catch(() => {});

    await onUserLogged(user);
  });
}

function _bindLogout(cleanupFn) {
  document.getElementById('logout-btn')?.addEventListener('click', async e => {
    e.preventDefault();
    try {
      cleanupFn?.();
      await signOut(auth);
      ['userName', 'userNickname', 'userUid', 'userEmail', 'navBadgeCount'].forEach(k => localStorage.removeItem(k));
      window.location.replace('../login.html');
    } catch (err) {
      console.error('[강비서] 로그아웃 오류:', err);
    }
  });
}
