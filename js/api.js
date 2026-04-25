// js/api.js

// 1. 파이어베이스 라이브러리 로드 (CDN 방식)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

// 2. 파이어베이스 설정 
const firebaseConfig = {
  apiKey: "AIzaSyDfM4zUHipTiWf5GlSij5CsWnh6W8zKFLM",
  authDomain: "kang-biseo.firebaseapp.com",
  projectId: "kang-biseo",
  storageBucket: "kang-biseo.firebasestorage.app",
  messagingSenderId: "367524528112",
  appId: "1:367524528112:web:b93350e80b9ec2c428a735",
  measurementId: "G-Z29RMHZMZV"
};

// 3. 파이어베이스 초기화
const app = initializeApp(firebaseConfig);

// 4. 서비스별 인스턴스 생성 및 'export' (밖에서 쓸 수 있게 내보내기)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');

/* ════════════════════════════════════════
   구글 캘린더 API
   sessionStorage 'gcal_token' 을 이용해 주 캘린더 일정을 조회한다.
   — 오늘 기준 과거 1개월 ~ 향후 3개월 범위
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

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy:      'startTime',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`캘린더 API ${res.status}: ${JSON.stringify(errBody)}`);
  }

  const data = await res.json();
  return data.items ?? [];
}

/* ════════════════════════════════════════
   공통 Firestore 강의 구독
   uid 기준 onSnapshot을 걸고 unsubscribe 함수를 반환한다.
════════════════════════════════════════ */
export function subscribeLectures(uid, callback, onError) {
  const q = query(collection(db, 'lectures'), where('uid', '==', uid));
  return onSnapshot(q, callback, onError);
}

/* ════════════════════════════════════════
   공통 인증 가드
   미로그인 → ../login.html 리다이렉트
   로그인 → localStorage 세팅 후 onUserLogged(user) 호출
════════════════════════════════════════ */
export function authGuard(onUserLogged) {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.replace('../login.html'); return; }
    localStorage.setItem('userName',  user.displayName || '강사');
    localStorage.setItem('userUid',   user.uid);
    localStorage.setItem('userEmail', user.email || '');
    await onUserLogged(user);
  });
}

/* ════════════════════════════════════════
   공통 로그아웃
   cleanupFn: 페이지별 unsubscribe 등 정리 함수
════════════════════════════════════════ */
export function setupLogout(cleanupFn) {
  document.getElementById('logout-btn')?.addEventListener('click', async e => {
    e.preventDefault();
    try {
      cleanupFn?.();
      await signOut(auth);
      localStorage.removeItem('userName');
      localStorage.removeItem('userNickname');
      localStorage.removeItem('userUid');
      localStorage.removeItem('userEmail');
      window.location.replace('../login.html');
    } catch (err) {
      console.error('[강비서] 로그아웃 오류:', err);
    }
  });
}