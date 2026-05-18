// js/api.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js';
import { getFirestore, collection, query, where, orderBy, limit, startAfter, onSnapshot, getDocs, doc, getDoc, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
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
  const _apiData = await res.json();
  return (_apiData.items != null ? _apiData.items : []);
}

/* ════════════════════════════════════════
   localStorage 강의 캐시 (무거운 필드 제외)
════════════════════════════════════════ */
const _CACHE_VERSION  = 'v1';
const _CACHE_TTL_MS   = 10 * 60 * 1000; // 10분
const _HEAVY_FIELDS   = new Set(['memo', 'supplies', 'parkingInfo', 'groupInfo']);

function _cacheKey(uid) { return `kb_lec_${_CACHE_VERSION}_${uid}`; }

export function getLectureCache(uid) {
  try {
    const raw = localStorage.getItem(_cacheKey(uid));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > _CACHE_TTL_MS) { localStorage.removeItem(_cacheKey(uid)); return null; }
    return data;
  } catch { return null; }
}

export function setLectureCache(uid, lectures) {
  try {
    const slim = lectures.map(l => {
      const out = {};
      for (const [k, v] of Object.entries(l)) { if (!_HEAVY_FIELDS.has(k)) out[k] = v; }
      return out;
    });
    localStorage.setItem(_cacheKey(uid), JSON.stringify({ ts: Date.now(), data: slim }));
  } catch {}
}

export function clearLectureCache(uid) {
  try { localStorage.removeItem(_cacheKey(uid)); } catch {}
}

/* ════════════════════════════════════════
   공통 Firestore 강의 구독
════════════════════════════════════════ */
export function subscribeLectures(uid, callback, onError) {
  const q = query(collection(db, 'lectures'), where('uid', '==', uid));
  return onSnapshot(q, callback, onError);
}

/* ════════════════════════════════════════
   단발성 페이지네이션 강의 조회 (비실시간)
════════════════════════════════════════ */
export async function getPaginatedLectures(uid, pageSize = 30, lastDoc = null) {
  const constraints = [where('uid', '==', uid), orderBy('date', 'desc'), limit(pageSize)];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(collection(db, 'lectures'), ...constraints));
  return {
    docs:    snap.docs,
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

/* ════════════════════════════════════════
   수퍼어드민 이메일 — 멤버십 검사 전체 우회
════════════════════════════════════════ */
export const SUPER_ADMIN_EMAILS = new Set(['szvivasz@gmail.com', 'flypizza2@gmail.com']);

/* ════════════════════════════════════════
   알림 벨 — 드롭다운 초기화 + 내용 갱신
════════════════════════════════════════ */
function _initNotificationBell() {
  const bell = document.querySelector('.topbar-notification');
  if (!bell || document.getElementById('notification-dropdown')) return;

  const dropdown = document.createElement('div');
  dropdown.id = 'notification-dropdown';
  Object.assign(dropdown.style, {
    display: 'none', position: 'absolute', top: 'calc(100% + 8px)', right: '0',
    width: '280px', background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: '9999',
    padding: '0', overflow: 'hidden',
  });
  dropdown.innerHTML = `
    <div style="padding:12px 16px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;font-size:0.9rem;">🔔 알림</div>
    <div id="notification-list"></div>`;

  bell.style.position = 'relative';
  bell.appendChild(dropdown);

  let isOpen = false;
  bell.addEventListener('click', e => {
    e.stopPropagation();
    isOpen = !isOpen;
    dropdown.style.display = isOpen ? 'block' : 'none';
    bell.setAttribute('aria-expanded', String(isOpen));
  });
  document.addEventListener('click', () => {
    if (!isOpen) return;
    isOpen = false;
    dropdown.style.display = 'none';
  });
  bell.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bell.click(); }
    if (e.key === 'Escape') { isOpen = false; dropdown.style.display = 'none'; }
  });
}

function _refreshNotificationBell(notifications) {
  const dot = document.querySelector('.notification-dot');
  if (dot) dot.style.display = notifications.length > 0 ? '' : 'none';

  const list = document.getElementById('notification-list');
  if (!list) return;
  if (notifications.length === 0) {
    list.innerHTML = `<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:0.85rem;">새로운 알림이 없습니다.</div>`;
    return;
  }
  list.innerHTML = notifications.map(n =>
    `<div style="padding:12px 16px;border-bottom:1px solid #f9fafb;font-size:0.85rem;color:#374151;line-height:1.5;">${n.text}</div>`
  ).join('');
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

    // 4. 알림 벨 드롭다운 초기화 (모든 페이지 공통)
    _initNotificationBell();

    // 5. 닉네임: 캐시 우선 표시 → Firestore 최신값으로 갱신
    const cached = localStorage.getItem('userNickname') || user.displayName || '강사';
    updateSidebarUI(cached);

    getDoc(doc(db, 'users', user.uid)).then(async snap => {
      if (!snap.exists()) return;
      const data    = snap.data();
      const isAdmin = SUPER_ADMIN_EMAILS.has(user.email || '');

      const nick = data.nickname || '';
      if (nick) { localStorage.setItem('userNickname', nick); updateSidebarUI(nick); }
      else      localStorage.removeItem('userNickname');

      // Membership init — skipped for admins; only writes once (overwrite protection)
      if (!isAdmin && !data.membershipExpiresAt) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 31);
        setDoc(doc(db, 'users', user.uid), {
          membershipStatus:    'trial',
          monthlyPrice:        9900,
          membershipExpiresAt: Timestamp.fromDate(expiresAt),
        }, { merge: true }).catch(err => console.error('[강비서] 멤버십 초기화 오류:', err));
      }

      // Trial expiry notifications — admins always get an empty list
      const notifications = [];
      if (!isAdmin && data.membershipExpiresAt) {
        const expiresDate = data.membershipExpiresAt.toDate
          ? data.membershipExpiresAt.toDate()
          : new Date(data.membershipExpiresAt);
        const daysLeft = Math.ceil((expiresDate - new Date()) / 86400000);
        if (daysLeft <= 0) {
          notifications.push({ text: '🚨 무료 체험 기간이 만료되었습니다.' });
        } else if (daysLeft <= 7) {
          notifications.push({ text: `⚠️ 무료 체험 종료까지 ${daysLeft}일 남았습니다.` });
        }
      }
      _refreshNotificationBell(notifications);

    }).catch(() => {});

    await onUserLogged(user);
  });
}

/* ════════════════════════════════════════
   멤버십 만료 확인 — 강의/정산 페이지 게이팅
   만료 시 블로킹 오버레이를 띄우고 true 반환
════════════════════════════════════════ */
export async function checkMembershipExpiry(uid) {
  try {
    if (SUPER_ADMIN_EMAILS.has(auth.currentUser?.email || '')) return false;
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return false;
    const { membershipExpiresAt } = snap.data();
    if (!membershipExpiresAt) return false;
    const expiresDate = membershipExpiresAt.toDate ? membershipExpiresAt.toDate() : new Date(membershipExpiresAt);
    const expired = new Date() >= expiresDate;
    if (expired) _showMembershipExpiredModal();
    return expired;
  } catch {
    return false;
  }
}

function _showMembershipExpiredModal() {
  if (document.getElementById('membership-expired-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'membership-expired-overlay';
  Object.assign(overlay.style, {
    position:       'fixed',
    inset:          '0',
    background:     'rgba(0,0,0,0.72)',
    zIndex:         '9999',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '24px',
  });
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;max-width:420px;width:100%;
                padding:40px 32px;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.3);">
      <div style="font-size:2.8rem;margin-bottom:16px;">🔒</div>
      <h2 style="font-size:1.2rem;font-weight:700;color:#111827;margin:0 0 12px;">
        이용 기간이 만료되었습니다
      </h2>
      <p style="font-size:0.88rem;color:#6b7280;line-height:1.65;margin:0 0 28px;">
        무료 체험 기간이 종료되었습니다.<br/>
        강비서의 모든 기능을 계속 이용하시려면<br/>
        구독을 시작해 주세요.
      </p>
      <button type="button" disabled
              style="width:100%;padding:14px;border-radius:10px;font-size:0.95rem;
                     font-weight:700;border:none;background:#e5e7eb;color:#9ca3af;
                     cursor:not-allowed;margin-bottom:14px;">
        구독 시작하기 (준비 중)
      </button>
      <a href="./mypage.html#section-subscription"
         style="display:block;font-size:0.82rem;color:#2563c4;text-decoration:none;">
        구독 설정 페이지로 이동 →
      </a>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
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
