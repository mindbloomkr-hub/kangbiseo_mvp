// js/services/kakaoAddressService.js — Kakao 우편번호 검색 (공통)

let _loadPromise = null;

function _loadPostcode() {
  if (window.daum?.Postcode) return Promise.resolve();
  if (!_loadPromise) {
    _loadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload  = resolve;
      s.onerror = () => { _loadPromise = null; reject(); };
      document.head.appendChild(s);
    });
  }
  return _loadPromise;
}

export function openKakaoAddress(targetId) {
  _loadPostcode().then(() => {
    new daum.Postcode({
      oncomplete(data) {
        const addr = data.roadAddress || data.jibunAddress;
        const el = document.getElementById(targetId);
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.focus();
        }
      },
    }).open();
  }).catch(() => {
    window.showToast?.('주소 검색 서비스를 불러올 수 없습니다.', 'error');
  });
}
