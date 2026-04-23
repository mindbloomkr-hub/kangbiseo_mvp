// ============================================================
// shared/data-loader.js
// index.html <script id="app-data" type="application/json"> 블록을
// 파싱해 window.APP_DATA 를 생성합니다.
// EMAIL_BODY 는 별도로 직접 정의합니다.
// ============================================================

(function () {
  /* ── APP_DATA: inline JSON 파싱 ────────────────────────── */
  var el = document.getElementById('app-data');
  if (el) {
    try {
      window.APP_DATA = JSON.parse(el.textContent);
    } catch (e) {
      console.error('[data-loader] app-data JSON 파싱 실패:', e);
      window.APP_DATA = { painPoints: [], features: [], pricing: [] };
    }
  } else {
    console.warn('[data-loader] #app-data 엘리먼트를 찾을 수 없습니다.');
    window.APP_DATA = { painPoints: [], features: [], pricing: [] };
  }

  /* ── EMAIL_BODY: 데모 섹션용 샘플 메일 ─────────────────── */
  window.EMAIL_BODY = [
    '발신: KB증권 연수팀 <training@kbsec.co.kr>',
    '수신: 강사님',
    '제목: [강의 섭외] 4/24(금) 14:00-16:00 기흥 KB증권연수원 개인정보 교육',
    '',
    '안녕하세요, 강사님. KB증권 연수팀입니다.',
    '',
    '다음과 같이 강의 섭외를 요청드립니다.',
    '',
    '▶ 일  시: 2025년 4월 24일(금) 14:00 ~ 16:00',
    '▶ 장  소: 경기도 용인시 기흥구 KB증권 연수원',
    '▶ 주  제: 개인정보보호 교육',
    '▶ 대  상: 임직원 50명',
    '▶ 강의료: 별도 협의',
    '',
    '바쁘신 중에 번거롭게 해드려 죄송합니다.',
    '수락 여부를 알려주시면 감사하겠습니다.',
    '',
    '감사합니다.',
  ].join('\n');
})();
