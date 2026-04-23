// ============================================================
// shared/ui-atoms.js
// 앱 전역에서 재사용하는 원자(Atom) 수준 UI 컴포넌트
// ============================================================

/* ── 로딩 점 3개 애니메이션 ─────────────────────────────── */
window.LoadingDots = function LoadingDots() {
  return (
    <span className="loading-dots">
      <span className="loading-dot" />
      <span className="loading-dot" />
      <span className="loading-dot" />
    </span>
  );
};

/* ── 뱃지 (상태 태그) ────────────────────────────────────── */
window.Badge = function Badge({ children, variant = 'blue' }) {
  var variantClass = {
    blue:   'badge-blue',
    green:  'badge-green',
    red:    'badge-red',
    yellow: 'badge-yellow',
    gray:   'badge-gray',
    purple: 'badge-purple',
  }[variant] || 'badge-blue';

  return (
    <span className={'badge ' + variantClass}>{children}</span>
  );
};

/* ── 로고 (공통 사용) ────────────────────────────────────── */
// 로고 파일명은 아래 src 한 곳만 수정하면 전체 반영됩니다.
window.Logo = function Logo({ size = 8 }) {
  var h = size * 4; // size 단위 → px (tailwind 1unit = 4px)

  return (
    <div style={{ height: h, flexShrink: 0, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center' }}>
      <img
        src="logo_small.png" /* ← 로고 파일명을 여기서 변경 */
        alt="강비서 로고"
        style={{
          height: '100%',
          width: 'auto',        // 원본 비율(902×353) 자동 유지
          display: 'block',
          objectFit: 'contain',
        }}
        onError={function(e) {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'inline-flex';
        }}
      />
      {/* 이미지 로드 실패 시 폴백 */}
      <span style={{ display: 'none', fontSize: h * 0.6 + 'px',
        alignItems: 'center', justifyContent: 'center' }}>
        📘
      </span>
    </div>
  );
};

/* ── 섹션 레이블 (h2 위 작은 뱃지 대용) ─────────────────── */
window.SectionLabel = function SectionLabel({ children, variant }) {
  return (
    <Badge variant={variant || 'blue'}>
      {children}
    </Badge>
  );
};
