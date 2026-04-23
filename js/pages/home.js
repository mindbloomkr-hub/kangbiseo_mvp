// js/pages/home.js — 홈 대시보드 (Firestore 실시간 연동)
// type="module" 로 로드됨

import { auth, db } from '../api.js';
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

/* ════════════════════════════════════════
   XSS 방지 유틸
════════════════════════════════════════ */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════
   날짜 유틸
════════════════════════════════════════ */
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function getWeekDateStrings() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow  = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon  = new Date(today);
  mon.setDate(today.getDate() + diff);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  return dates;
}

/* ════════════════════════════════════════
   전역 상태
════════════════════════════════════════ */
let currentUser      = null;
let todos            = [];
let allLectures      = [];   // 유저의 전체 강의 (Firestore)
let todayLectures    = [];   // 오늘 강의 (allLectures에서 필터)
let unsubscribeTodos     = null;
let unsubscribeLectures  = null;

/* ════════════════════════════════════════
   1. 사이드바 유저 정보
════════════════════════════════════════ */
function updateSidebarUser(user) {
  const nameEl   = document.querySelector('.sidebar-user-name');
  const avatarEl = document.querySelector('.sidebar-avatar');
  if (!nameEl || !avatarEl) return;
  const name = localStorage.getItem('userName') || user.displayName || '강사';
  nameEl.textContent   = name + ' 강사';
  avatarEl.textContent = name.charAt(0);
}

function updateNavBadge() {
  const todayStr = getTodayString();
  const count = allLectures.filter(l => l.date >= todayStr).length;
  localStorage.setItem('navBadgeCount', String(count));
  const badgeEl = document.getElementById('nav-badge-lectures');
  if (!badgeEl) return;
  badgeEl.textContent = count;
  badgeEl.style.display = count > 0 ? '' : 'none';
}

/* ════════════════════════════════════════
   2. 환영 인사 (시간대 반응형)
════════════════════════════════════════ */
function renderGreeting() {
  const greetEl    = document.getElementById('greeting-text');
  const subtitleEl = document.getElementById('greeting-subtitle');
  if (!greetEl) return;

  const h = new Date().getHours();
  let emoji, greet;
  if      (h < 12) { emoji = '☀️'; greet = '좋은 아침이에요';  }
  else if (h < 18) { emoji = '🌤'; greet = '즐거운 오후예요';  }
  else             { emoji = '🌙'; greet = '수고하신 하루예요'; }

  const userName = localStorage.getItem('userName') || '강사';
  greetEl.innerHTML = `${emoji} ${userName} 강사님, ${greet}!`;

  if (subtitleEl) {
    subtitleEl.textContent = todayLectures.length > 0
      ? `오늘 강의가 ${todayLectures.length}건 있어요. 이동 시간을 미리 확인해 두세요.`
      : '오늘은 강의 일정이 없어요. 다음 강의를 준비해 보세요.';
  }
}

/* ════════════════════════════════════════
   3. 상단 통계 카드 (오늘 강의 기반)
════════════════════════════════════════ */
function renderStatBar() {
  const container = document.getElementById('stat-bar');
  if (!container) return;

  const totalFee   = todayLectures.reduce((sum, l) => sum + (Number(l.fee) || 0), 0);
  const unpaidCnt  = allLectures.filter(l => {
    const d = new Date(l.date);
    d.setHours(0,0,0,0);
    return !l.isPaid && d < new Date().setHours(0,0,0,0);
  }).length;
  const unpaidAmt  = allLectures
    .filter(l => { const d = new Date(l.date); d.setHours(0,0,0,0); return !l.isPaid && d < new Date().setHours(0,0,0,0); })
    .reduce((s, l) => s + (Number(l.fee) || 0), 0);

  const stats = [
    { icon: '📅', iconCls: 'stat-icon--blue',   value: `${todayLectures.length}건`,                      label: '오늘 강의',      delta: '' },
    { icon: '💰', iconCls: 'stat-icon--green',  value: totalFee > 0 ? `${(totalFee/10000).toFixed(0)}만원` : '—', label: '오늘 예상 수익', delta: '' },
    { icon: '⏱',  iconCls: 'stat-icon--yellow', value: todayLectures.length > 1 ? '이동 확인' : '—',         label: '이동 버퍼 타임', delta: '' },
    { icon: '💳', iconCls: 'stat-icon--red',    value: `${unpaidCnt}건`,                                  label: '미입금 정산',    delta: unpaidAmt > 0 ? `₩${unpaidAmt.toLocaleString()} 미수` : '' },
  ];

  container.innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-icon ${s.iconCls}">${s.icon}</div>
      <div class="stat-body">
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
        ${s.delta ? `<div class="stat-delta stat-delta--down">${s.delta}</div>` : ''}
      </div>
    </div>
  `).join('');
}

/* ════════════════════════════════════════
   4. 오늘의 강의 브리핑 카드
════════════════════════════════════════ */
function renderBriefingCards() {
  const container = document.getElementById('briefing-list');
  if (!container) return;

  if (todayLectures.length === 0) {
    container.innerHTML = `
      <div class="no-lecture-state">
        <div class="no-lecture-icon">📭</div>
        <p class="no-lecture-text">오늘 예정된 강의가 없어요.<br /><a href="lectures.html" style="color:var(--color-primary-500)">강의를 등록해 보세요 →</a></p>
      </div>`;
    return;
  }

  container.innerHTML = todayLectures.map((l, idx) => {
    const stripe = (idx % 3) + 1;
    const mgrInitial = (l.managerName || '담').charAt(0);
    return `
      <div class="lecture-briefing-card">
        <div class="briefing-stripe briefing-stripe--${stripe}"></div>
        <div class="briefing-body">
          <div class="briefing-row-top">
            <span class="briefing-time">${l.timeStart} – ${l.timeEnd}</span>
            <span class="status-chip status-chip--scheduled">예정</span>
          </div>
          <div class="briefing-title">${escapeHtml(l.title)}</div>
          <div class="briefing-meta-grid">
            <div class="briefing-meta-item"><span class="briefing-meta-icon">🏢</span><span class="briefing-meta-text">${escapeHtml(l.client)}</span></div>
            <div class="briefing-meta-item"><span class="briefing-meta-icon">📍</span><span class="briefing-meta-text">${escapeHtml(l.place || '장소 미정')}</span></div>
            <div class="briefing-meta-item"><span class="briefing-meta-icon">⏱</span><span class="briefing-meta-text">${l.timeStart} ~ ${l.timeEnd}</span></div>
            <div class="briefing-meta-item"><span class="briefing-meta-icon">💰</span><span class="briefing-meta-text">₩${(Number(l.fee)||0).toLocaleString()}</span></div>
          </div>
        </div>
        <div class="briefing-footer">
          <div class="briefing-manager">
            <div class="briefing-manager-avatar">${escapeHtml(mgrInitial)}</div>
            <span>담당자 · ${escapeHtml(l.managerName || '미등록')}</span>
          </div>
          ${l.managerPhone
            ? `<button class="briefing-contact-btn" onclick="window.location.href='tel:${l.managerPhone}'">📞 연락하기</button>`
            : ''}
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   5. 오늘의 타임스케줄 (실제 강의 데이터 기반)
════════════════════════════════════════ */
function renderTimeline() {
  const container = document.getElementById('timeline-list');
  if (!container) return;

  if (todayLectures.length === 0) {
    container.innerHTML = `
      <div class="no-lecture-state" style="padding:var(--space-8) 0;">
        <div class="no-lecture-icon">📭</div>
        <p class="no-lecture-text">오늘 일정이 없어요.</p>
      </div>`;
    return;
  }

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  function timeToMin(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function nowBar() {
    return `
      <div style="display:flex;align-items:center;gap:12px;margin:12px 0 12px 90px;">
        <div style="border-top:2px dashed #2563c4;width:40px;"></div>
        <span style="color:#2563c4;font-weight:bold;font-size:0.85rem;">현재 ${nowStr}</span>
      </div>`;
  }

  let nowInserted = false;
  const html = todayLectures.map((lec, idx) => {
    const itemMin = timeToMin(lec.timeStart);
    const nextMin = todayLectures[idx + 1] ? timeToMin(todayLectures[idx + 1].timeStart) : Infinity;
    const isDone  = timeToMin(lec.timeEnd) < nowMin;
    const cardCls = isDone ? 'tl-card tl-card--done' : 'tl-card tl-card--lecture';
    const nodeCls = isDone ? 'tl-node tl-node--done' : 'tl-node tl-node--lecture';

    let barBefore = '';
    let barAfter  = '';

    if (idx === 0 && nowMin < itemMin) {
      nowInserted = true;
      barBefore = nowBar();
    } else if (!nowInserted && nowMin >= itemMin && nowMin < nextMin) {
      nowInserted = true;
      barAfter = nowBar();
    }

    return `
      ${barBefore}
      <div class="timeline-item">
        <div class="tl-time-col"><div class="tl-time">${lec.timeStart}</div></div>
        <div class="tl-track"><div class="${nodeCls}"></div></div>
        <div class="tl-content">
          <div class="${cardCls}">
            <div class="tl-card-title">${escapeHtml(lec.title)}</div>
            <div class="tl-card-sub">${escapeHtml(lec.place || lec.client)} · ${lec.timeStart}~${lec.timeEnd}</div>
            <span class="tl-card-badge tl-card-badge--lecture">강의</span>
          </div>
        </div>
      </div>
      ${barAfter}`;
  }).join('');

  container.innerHTML = html + (!nowInserted ? nowBar() : '');
}

/* ════════════════════════════════════════
   6. 이번 주 일정 (실제 강의 데이터 기반)
════════════════════════════════════════ */
function renderWeekly() {
  const gridEl    = document.getElementById('weekly-day-grid');
  const summaryEl = document.getElementById('weekly-summary');
  if (!gridEl) return;

  const today      = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr   = getTodayString();
  const weekDates  = getWeekDateStrings(); // Mon~Sun

  const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0];

  // 요일 인덱스 → 날짜 문자열 맵
  const dowToDateStr = {};
  weekDates.forEach((dateStr, i) => {
    const d = new Date(dateStr);
    dowToDateStr[d.getDay()] = dateStr;
  });

  // 날짜 문자열 → 강의 목록 맵
  const dateToLectures = {};
  allLectures.forEach(lec => {
    if (weekDates.includes(lec.date)) {
      if (!dateToLectures[lec.date]) dateToLectures[lec.date] = [];
      dateToLectures[lec.date].push(lec);
    }
  });

  gridEl.innerHTML = DAY_ORDER.map(dow => {
    const dateStr  = dowToDateStr[dow];
    const dateObj  = dateStr ? new Date(dateStr) : null;
    const isToday  = dateStr === todayStr;
    const isPast   = dateObj && dateObj < today;
    const lectures = (dateToLectures[dateStr] || []).sort((a, b) => a.timeStart.localeCompare(b.timeStart));

    let daynameClass = 'week-col-dayname';
    if (isToday)       daynameClass += ' today-col';
    else if (dow === 0) daynameClass += ' sun';
    else if (dow === 6) daynameClass += ' sat';

    const dateNum  = dateObj ? dateObj.getDate() : '—';
    const lecCards = lectures.length > 0
      ? lectures.map(lec => `
          <div class="week-lec-card" style="${isPast && !isToday ? 'opacity:0.55;' : ''}">
            <div class="week-lec-time">${lec.timeStart}</div>
            <div class="week-lec-title">${escapeHtml(lec.title)}</div>
          </div>`).join('')
      : `<div class="week-empty-day">—</div>`;

    return `
      <div class="week-col">
        <div class="${isToday ? 'week-col-header today-col' : 'week-col-header'}">
          <span class="${daynameClass}">${DAY_KO[dow]}</span>
          <div class="week-col-datenum ${isToday ? 'today' : ''}">${dateNum}</div>
        </div>
        ${lecCards}
      </div>`;
  }).join('');

  const weekTotal    = Object.values(dateToLectures).flat().length;
  const weekTotalFee = Object.values(dateToLectures).flat().reduce((s, l) => s + (Number(l.fee)||0), 0);
  const daysWithLec  = Object.keys(dateToLectures).length;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="weekly-summary-item"><span>📋</span><span>이번 주 강의</span><span class="weekly-summary-value">${weekTotal}건</span></div>
      <div class="weekly-summary-item"><span>💰</span><span>예상 수익</span><span class="weekly-summary-value">₩${(weekTotalFee/10000).toFixed(0)}만원</span></div>
      <div class="weekly-summary-item"><span>🚗</span><span>강의 있는 날</span><span class="weekly-summary-value">${daysWithLec}일</span></div>`;
  }
}

/* ════════════════════════════════════════
   7. 강의 Firestore 실시간 구독
════════════════════════════════════════ */
function initLectures(uid) {
  if (unsubscribeLectures) unsubscribeLectures();

  const q = query(
    collection(db, 'lectures'),
    where('uid', '==', uid),
  );

  unsubscribeLectures = onSnapshot(q, snapshot => {
    allLectures = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const todayStr = getTodayString();
    todayLectures  = allLectures
      .filter(l => l.date === todayStr)
      .sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''));

    renderGreeting();
    renderStatBar();
    renderBriefingCards();
    renderTimeline();
    renderWeekly();
    updateNavBadge();
  }, err => {
    console.error('[강비서] 강의 구독 오류:', err);
  });
}

/* ════════════════════════════════════════
   8. To-do List — Firestore 실시간 연동
   문서 구조: { uid, text, isDone, createdAt }
════════════════════════════════════════ */
function renderTodoList() {
  const list    = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  if (!list) return;

  if (todos.length === 0) {
    list.innerHTML = `<div class="todo-empty">등록된 할 일이 없어요 ✓</div>`;
  } else {
    list.innerHTML = todos.map(todo => `
      <div class="todo-item ${todo.isDone ? 'done' : ''}" data-id="${todo.id}">
        <div class="todo-checkbox ${todo.isDone ? 'checked' : ''}"
          role="checkbox" aria-checked="${todo.isDone}" tabindex="0">
          ${todo.isDone ? '✓' : ''}
        </div>
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        <button class="todo-delete-btn" aria-label="삭제">✕</button>
      </div>
    `).join('');
  }

  const doneCount = todos.filter(t => t.isDone).length;
  if (countEl) countEl.textContent = `완료 ${doneCount} / 전체 ${todos.length}`;

  list.querySelectorAll('.todo-checkbox').forEach(cb => {
    const getId = () => cb.closest('.todo-item').dataset.id;
    cb.addEventListener('click',   () => todoToggle(getId()));
    cb.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); todoToggle(getId()); }
    });
  });

  list.querySelectorAll('.todo-text').forEach(txt => {
    txt.addEventListener('click', () => todoToggle(txt.closest('.todo-item').dataset.id));
  });

  list.querySelectorAll('.todo-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      todoDelete(btn.closest('.todo-item').dataset.id);
    });
  });
}

function initTodos(uid) {
  if (unsubscribeTodos) unsubscribeTodos();

  const q = query(
    collection(db, 'todos'),
    where('uid', '==', uid),
  );

  unsubscribeTodos = onSnapshot(q, snapshot => {
    todos = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return aMs - bMs;
      });
    renderTodoList();
  }, err => {
    console.error('[강비서] Todo 구독 오류:', err);
  });
}

async function todoAdd() {
  const input = document.getElementById('todo-input');
  const text  = input?.value.trim();
  if (!text || !currentUser) return;
  try {
    await addDoc(collection(db, 'todos'), {
      uid: currentUser.uid, text, isDone: false, createdAt: serverTimestamp(),
    });
    input.value = '';
  } catch (err) {
    console.error('[강비서] Todo 추가 오류:', err);
  }
}

async function todoToggle(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  try {
    await updateDoc(doc(db, 'todos', id), { isDone: !todo.isDone });
  } catch (err) {
    console.error('[강비서] Todo 토글 오류:', err);
  }
}

async function todoDelete(id) {
  try {
    await deleteDoc(doc(db, 'todos', id));
  } catch (err) {
    console.error('[강비서] Todo 삭제 오류:', err);
  }
}

async function todoClearDone() {
  const done = todos.filter(t => t.isDone);
  if (done.length === 0) return;
  try {
    await Promise.all(done.map(t => deleteDoc(doc(db, 'todos', t.id))));
  } catch (err) {
    console.error('[강비서] 완료 항목 삭제 오류:', err);
  }
}

/* ════════════════════════════════════════
   이벤트 바인딩
════════════════════════════════════════ */
document.getElementById('todo-add-btn')?.addEventListener('click', todoAdd);
document.getElementById('todo-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') todoAdd();
});
document.getElementById('todo-clear-done')?.addEventListener('click', todoClearDone);

document.getElementById('logout-btn')?.addEventListener('click', async e => {
  e.preventDefault();
  try {
    if (unsubscribeTodos)    unsubscribeTodos();
    if (unsubscribeLectures) unsubscribeLectures();
    await signOut(auth);
    localStorage.removeItem('userName');
    localStorage.removeItem('userUid');
    localStorage.removeItem('userEmail');
    window.location.replace('../login.html');
  } catch (err) {
    console.error('[강비서] 로그아웃 오류:', err);
  }
});

/* ════════════════════════════════════════
   초기 렌더 (빈 상태 — 데이터 로딩 전)
════════════════════════════════════════ */
renderGreeting();
renderStatBar();
renderBriefingCards();
renderTimeline();
renderWeekly();
renderTodoList();

/* ════════════════════════════════════════
   인증 상태 감지 — 권한 가드 + 구독 시작
════════════════════════════════════════ */
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.replace('../login.html');
    return;
  }

  currentUser = user;
  localStorage.setItem('userName',  user.displayName || '강사');
  localStorage.setItem('userUid',   user.uid);
  localStorage.setItem('userEmail', user.email || '');

  updateSidebarUser(user);
  renderGreeting();

  initLectures(user.uid);
  initTodos(user.uid);
});
