/* js/pages/landing.js — 랜딩페이지 전용 스크립트 */

(function () {
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

  function renderPreviewDate() {
    const el = document.getElementById('preview-today-date');
    if (!el) return;
    const now = new Date();
    const month = now.getMonth() + 1;
    const date  = now.getDate();
    const day   = DAYS_KO[now.getDay()];
    el.textContent = `${month}월 ${date}일 (${day})`;
  }

  function initHamburger() {
    const btn = document.getElementById('hamburger-btn');
    const nav = document.getElementById('mobile-nav');
    if (!btn || !nav) return;

    function openNav() {
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      nav.removeAttribute('hidden');
    }

    function closeNav() {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      nav.setAttribute('hidden', '');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      btn.classList.contains('is-open') ? closeNav() : openNav();
    });

    // 내비 링크 클릭 시 닫기
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });

    // 외부 클릭 시 닫기
    document.addEventListener('click', function (e) {
      if (!btn.contains(e.target) && !nav.contains(e.target)) {
        closeNav();
      }
    });

    // 모바일 문의하기 → 데스크톱 ContactModal 트리거 위임
    const mobileContactBtn = document.getElementById('btn-contact-open-mobile');
    if (mobileContactBtn) {
      mobileContactBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeNav();
        const desktopBtn = document.getElementById('btn-contact-open');
        if (desktopBtn) desktopBtn.click();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderPreviewDate();
    initHamburger();
  });
}());
