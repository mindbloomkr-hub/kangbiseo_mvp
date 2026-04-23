/* js/pages/landing.js — 랜딩페이지 전용 스크립트 */

(function () {
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

  function renderPreviewDate() {
    const el = document.getElementById('preview-today-date');
    if (!el) return;
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const day = DAYS_KO[now.getDay()];
    el.textContent = `${month}월 ${date}일 (${day})`;
  }

  document.addEventListener('DOMContentLoaded', renderPreviewDate);
})();
