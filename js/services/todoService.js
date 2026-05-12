// js/services/todoService.js — 할 일 서비스 (Firestore CRUD + 미루기)
import { db } from '../api.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

function _dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ════════════════════════════════════════
   구독
════════════════════════════════════════ */
export function subscribeTodos(uid, onUpdate, onError) {
  const q = query(collection(db, 'todos'), where('uid', '==', uid));
  return onSnapshot(q, snap => {
    const todos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0));
    onUpdate(todos);
  }, onError);
}

// Filters client-side to avoid requiring a composite Firestore index.
export function subscribeLectureTodos(uid, lectureId, onUpdate, onError) {
  const q = query(collection(db, 'todos'), where('uid', '==', uid));
  return onSnapshot(q, snap => {
    const todos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.lectureId === lectureId)
      .sort((a, b) => (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0));
    onUpdate(todos);
  }, onError);
}

/* ════════════════════════════════════════
   CRUD
════════════════════════════════════════ */
export async function addTodo(uid, text, lectureId = null, groupId = null, dueDate = null) {
  if (!uid || !text?.trim()) throw new Error('uid와 text가 필요합니다.');
  return addDoc(collection(db, 'todos'), {
    uid,
    text: text.trim(),
    isDone: false,
    lectureId: (lectureId != null ? lectureId : null),
    groupId: (groupId != null ? groupId : null),
    deadline: dueDate || _dateStr(0),
    createdAt: serverTimestamp(),
    completedAt: null,
    postponeCount: 0,
  });
}

export async function updateTodoDueDate(id, dateStr) {
  return updateDoc(doc(db, 'todos', id), { deadline: dateStr });
}

export function subscribeGroupTodos(uid, groupId, onUpdate, onError) {
  const q = query(collection(db, 'todos'), where('uid', '==', uid));
  return onSnapshot(q, snap => {
    const todos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.groupId === groupId)
      .sort((a, b) => (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0));
    onUpdate(todos);
  }, onError);
}

export async function toggleTodo(id, currentDone) {
  return updateDoc(doc(db, 'todos', id), {
    isDone: !currentDone,
    completedAt: !currentDone ? serverTimestamp() : null,
  });
}

export async function deleteTodo(id) {
  return deleteDoc(doc(db, 'todos', id));
}

export async function clearDoneTodos(todos) {
  const done = todos.filter(t => t.isDone);
  if (!done.length) return;
  await Promise.all(done.map(t => deleteDoc(doc(db, 'todos', t.id))));
}

/* ════════════════════════════════════════
   미루기
════════════════════════════════════════ */
export async function postponeTodo(id) {
  return updateDoc(doc(db, 'todos', id), {
    deadline: _dateStr(1),
    postponeCount: increment(1),
  });
}

// 오늘 마감인 미완료 할 일을 전부 내일로 미룬다.
// Returns the number of todos postponed.
export async function postponeAllTodayTodos(todos) {
  const today   = _dateStr(0);
  const targets = todos.filter(t => !t.isDone && t.deadline === today);
  if (!targets.length) return 0;
  await Promise.all(targets.map(t => postponeTodo(t.id)));
  return targets.length;
}
