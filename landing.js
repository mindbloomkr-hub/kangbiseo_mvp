// js/common.js — 사이드바·탑바 공통 동작 및 유틸리티

'use strict';

/* ════════════════════════════════════════
   사이드바 토글 (데스크탑: 접힘/펼침)
════════════════════════════════════════ */
(function initSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const appMain  = document.getElementById('app-main');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const overlay  = document.getElementById('sidebar-overlay');
  const mobileBtn = document.getElementById('mobile-menu-btn');

  if (!sidebar) return;

  // 로컬 스토리지에서 사이드바 상태 복원
  const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
    appMain?.classList.add('sidebar-collapsed');
  }

  // 데스크탑 토글
  toggleBtn?.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    appMain?.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem('sidebar-collapsed', collapsed);
  });

  // 모바일: 오버레이 드로어
  function openMobileSidebar() {
    sidebar.classList.add('mobile-open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    sidebar.classList.remove('mobile-open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  mobileBtn?.addEventListener('click', openMobileSidebar);
  overlay?.addEventListener('click', closeMobileSidebar);

  // ESC 키로 모바일 사이드바 닫기
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMobileSidebar();
  });
})();

/* ════════════════════════════════════════
   현재 페이지에 맞는 사이드바 메뉴 활성화
════════════════════════════════════════ */
(function setActiveNav() {
  const currentPath = location.pathname;
  document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(item => {
    const page = item.dataset.page;
    if (currentPath.endsWith(page)) {
      item.classList.add('active');
    }
  });
})();

/* ════════════════════════════════════════
   탑바 날짜 표시
════════════════════════════════════════ */
(function setTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;

  const now = new Date();
  const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const y  = now.getFullYear();
  const m  = now.getMonth() + 1;
  const d  = now.getDate();
  const dy = DAY_KO[now.getDay()];

  el.textContent = `${y}년 ${m}월 ${d}일 (${dy})`;
})();

/* ════════════════════════════════════════
   Toast 유틸 (공통 export)
════════════════════════════════════════ */
let _toastTimer = null;

window.showToast = function (message, type = 'default', duration = 3000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = 'toast show';
  if (type === 'error')   toast.classList.add('toast--error');
  if (type === 'success') toast.classList.add('toast--success');

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
};

/* ════════════════════════════════════════
   날짜/시간 포맷 헬퍼
════════════════════════════════════════ */
window.formatTime = function (h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

window.formatKoreanDate = function (date) {
  const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const m  = date.getMonth() + 1;
  const d  = date.getDate();
  const dy = DAY_KO[date.getDay()];
  return `${m}월 ${d}일 (${dy})`;
};
