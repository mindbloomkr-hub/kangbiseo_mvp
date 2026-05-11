// js/components/todoComponent.js — 할 일 UI 컴포넌트 (홈 + 모달 공용)
import { escapeHtml, getTodayString, hexToRgba } from '../utils.js';
import { toggleTodo, deleteTodo, postponeTodo, updateTodoDueDate, subscribeLectureTodos, subscribeGroupTodos } from '../services/todoService.js';

/* ════════════════════════════════════════
   단일 항목 HTML 생성
════════════════════════════════════════ */
export function createTodoItemHTML(todo, allLectures = [], topicTags = []) {
  const today     = getTodayString();
  const isToday   = todo.deadline === today;
  const isOverdue = !todo.isDone && todo.deadline && todo.deadline < today;
  const count     = todo.postponeCount ?? 0;
  const isGroup   = !!todo.groupId;

  // Find lecture — support groupId fallback for multi-session todos
  const lecture = todo.lectureId
    ? allLectures.find(l => l.id === todo.lectureId)
    : todo.groupId
      ? allLectures.find(l => l.groupId === todo.groupId)
      : null;

  const tag       = lecture?.topicTagId != null ? topicTags.find(t => t.id === lecture.topicTagId) : null;
  const tagColor  = tag?.color ?? null;
  const tagBgRgba = tagColor ? hexToRgba(tagColor, 0.04) : null;

  const styleAttrs = [
    tagBgRgba ? `--todo-tag-bg:${tagBgRgba}` : '',
    tagColor  ? `border-left:3px solid ${tagColor}` : '',
  ].filter(Boolean).join(';');

  const badgeHtml = lecture
    ? isGroup
      ? `<span class="todo-lec-badge todo-lec-badge--group" data-group-id="${escapeHtml(todo.groupId)}" title="${escapeHtml(lecture.title)}" style="cursor:pointer">🔗 ${escapeHtml(lecture.title)}</span>`
      : `<span class="todo-lec-badge" data-lec-id="${escapeHtml(lecture.id)}" title="${escapeHtml(lecture.title)}" style="cursor:pointer">📌 ${escapeHtml(lecture.title)}</span>`
    : '';

  const postponeBadge = count > 0
    ? `<span class="todo-postpone-count" title="${count}회 미룸">+${count}</span>`
    : '';

  const deadlineEl = todo.deadline && !todo.isDone
    ? `<span class="todo-deadline${isToday ? ' todo-deadline--today' : ''}${isOverdue ? ' todo-deadline--overdue' : ''}">${todo.deadline}</span>`
    : '';

  const hasMeta = badgeHtml || postponeBadge || deadlineEl;

  const checkSvg = `<svg class="todo-check-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
    ${todo.isDone ? '<path d="M4.5 8.5l2.25 2.25L11.5 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' : ''}
  </svg>`;

  const postponeSvg = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
    <path d="M8 4.5V8.25l2.25 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const deleteSvg = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
    <path d="M2.5 4h11M5.5 4V2.5h5V4M6 6.5v5M10 6.5v5M3.5 4l.667 9.5h8.166L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const calendarSvg = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
    <rect x="1.5" y="3" width="13" height="11.5" rx="2" stroke="currentColor" stroke-width="1.5"/>
    <path d="M1.5 6.5h13M5 1.5V4.5M11 1.5V4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

  return `
    <div class="todo-item${todo.isDone ? ' done' : ''}" data-id="${escapeHtml(todo.id)}" role="listitem"${styleAttrs ? ` style="${styleAttrs}"` : ''}>
      <button class="todo-check${todo.isDone ? ' checked' : ''}" role="checkbox" aria-checked="${todo.isDone}" tabindex="0" aria-label="완료 토글">${checkSvg}</button>
      <div class="todo-body">
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        ${hasMeta ? `<div class="todo-meta">${badgeHtml}${postponeBadge}${deadlineEl}</div>` : ''}
      </div>
      <div class="todo-actions" style="position:relative">
        <input type="date" class="todo-due-input" value="${escapeHtml(todo.deadline || '')}"
               aria-label="기한 변경" tabindex="-1"
               style="position:absolute;opacity:0;width:1px;height:1px;border:0;padding:0;overflow:hidden;clip:rect(0,0,0,0)"
               ${todo.isDone ? 'disabled' : ''}>
        <button class="todo-btn todo-btn--due" title="기한 변경" aria-label="기한 변경"${todo.isDone ? ' disabled' : ''}>${calendarSvg}</button>
        <button class="todo-btn todo-btn--postpone" title="내일로 미루기" aria-label="내일로 미루기"${todo.isDone ? ' disabled' : ''}>${postponeSvg}</button>
        <button class="todo-btn todo-btn--delete" aria-label="삭제">${deleteSvg}</button>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   목록 렌더링
════════════════════════════════════════ */
export function renderTodoList(container, todos, allLectures = [], topicTags = []) {
  if (!container) return;
  container.innerHTML = todos.length === 0
    ? '<div class="todo-empty"><span class="todo-empty-icon">✓</span><span>등록된 할 일이 없어요</span></div>'
    : todos.map(t => createTodoItemHTML(t, allLectures, topicTags)).join('');
}

/* ════════════════════════════════════════
   이벤트 위임 (container에 1회만 호출)
════════════════════════════════════════ */
export function bindTodoEvents(container, getTodos, { getAllLectures, openModal } = {}) {
  if (!container) return;

  container.addEventListener('click', e => {
    // ── Lecture badge clicks — intercept before .todo-item toggle logic ──
    if (openModal) {
      const lecBadge = e.target.closest('.todo-lec-badge[data-lec-id]');
      if (lecBadge) {
        e.stopPropagation();
        e.preventDefault();
        openModal(lecBadge.dataset.lecId);
        return;
      }
      const groupBadge = e.target.closest('.todo-lec-badge[data-group-id]');
      if (groupBadge) {
        e.stopPropagation();
        e.preventDefault();
        const lecs = getAllLectures?.() ?? [];
        const lec  = lecs.find(l => l.groupId === groupBadge.dataset.groupId);
        if (lec) openModal(lec.id);
        return;
      }
    }

    const item = e.target.closest('.todo-item[data-id]');
    if (!item) return;
    const id   = item.dataset.id;
    const todo = getTodos().find(t => t.id === id);
    if (!todo) return;

    if (e.target.closest('.todo-btn--delete')) {
      e.stopPropagation();
      deleteTodo(id).catch(err => console.error('[강비서] Todo 삭제 오류:', err));
    } else if (e.target.closest('.todo-btn--due') && !todo.isDone) {
      e.stopPropagation();
      const dueInput = item.querySelector('.todo-due-input');
      if (dueInput) {
        try { dueInput.showPicker(); } catch { dueInput.click(); }
      }
    } else if (e.target.closest('.todo-btn--postpone') && !todo.isDone) {
      e.stopPropagation();
      postponeTodo(id).catch(err => console.error('[강비서] Todo 미루기 오류:', err));
    } else if (e.target.closest('.todo-check') || e.target.closest('.todo-text')) {
      toggleTodo(id, todo.isDone).catch(err => console.error('[강비서] Todo 토글 오류:', err));
    }
  });

  container.addEventListener('change', e => {
    if (!e.target.matches('.todo-due-input')) return;
    const item    = e.target.closest('.todo-item[data-id]');
    const newDate = e.target.value;
    if (!item || !newDate) return;
    updateTodoDueDate(item.dataset.id, newDate)
      .catch(err => console.error('[강비서] 기한 변경 오류:', err));
  });

  container.addEventListener('keydown', e => {
    const cb = e.target.closest('.todo-check');
    if (!cb || (e.key !== ' ' && e.key !== 'Enter')) return;
    e.preventDefault();
    const id   = cb.closest('.todo-item')?.dataset.id;
    const todo = id ? getTodos().find(t => t.id === id) : null;
    if (todo) toggleTodo(id, todo.isDone).catch(err => console.error('[강비서] Todo 토글 오류:', err));
  });
}

/* ════════════════════════════════════════
   통합 UI 초기화 (라이브 구독 또는 Pending 모드)
════════════════════════════════════════ */
/**
 * renderTodoUI(container, lectureId, options)
 *
 * Live mode — groupId 우선, 없으면 lectureId로 Firestore 실시간 구독. unsubscribe 함수 반환.
 * Pending 모드 — 로컬 배열로 동작. refresh 함수 반환.
 *
 * options:
 *   uid             – 로그인 사용자 uid (live 모드 필수)
 *   allLectures     – 강의 배지 표시용 배열
 *   topicTags       – 태그 색상 표시용 배열
 *   groupId         – 멀티세션 그룹 ID (live 모드, groupId 기반 구독)
 *   getPendingTodos – () => Todo[]   (pending 모드 필수)
 *   onPendingChange – (updated[]) => void  (pending 모드 삭제 시 호출)
 */
export function renderTodoUI(container, lectureId, options = {}) {
  if (!container) return () => {};

  const { uid, allLectures = [], topicTags = [], groupId, getPendingTodos, onPendingChange } = options;

  // ── Live sync: groupId 기반 구독 ─────────────────────────────────────
  if (groupId && uid) {
    if (!container._todosRef) container._todosRef = { current: [] };
    const ref = container._todosRef;

    if (!container.dataset.todoEventsInited) {
      container.dataset.todoEventsInited = '1';
      bindTodoEvents(container, () => ref.current);
    }

    return subscribeGroupTodos(uid, groupId, updated => {
      ref.current = updated;
      renderTodoList(container, updated, allLectures, topicTags);
    }, err => console.error('[강비서] Todo 구독 오류:', err));
  }

  // ── Live sync: lectureId 기반 구독 ───────────────────────────────────
  if (lectureId && uid) {
    if (!container._todosRef) container._todosRef = { current: [] };
    const ref = container._todosRef;

    if (!container.dataset.todoEventsInited) {
      container.dataset.todoEventsInited = '1';
      bindTodoEvents(container, () => ref.current);
    }

    return subscribeLectureTodos(uid, lectureId, updated => {
      ref.current = updated;
      renderTodoList(container, updated, allLectures, topicTags);
    }, err => console.error('[강비서] Todo 구독 오류:', err));
  }

  // ── Pending 모드: 로컬 배열 (신규 강의 등록 시) ─────────────────────
  if (!container.dataset.todoEventsInited) {
    container.dataset.todoEventsInited = '1';
    container.addEventListener('click', e => {
      const item = e.target.closest('.todo-item[data-id]');
      if (!item) return;
      if (e.target.closest('.todo-btn--delete')) {
        e.stopPropagation();
        const pending = getPendingTodos?.() ?? [];
        const updated = pending.filter(t => t.id !== item.dataset.id);
        onPendingChange?.(updated);
        renderTodoList(container, updated, allLectures, topicTags);
      }
    });
  }

  const todos = getPendingTodos?.() ?? [];
  renderTodoList(container, todos, allLectures, topicTags);

  return () => {
    const updated = getPendingTodos?.() ?? [];
    renderTodoList(container, updated, allLectures, topicTags);
  };
}
