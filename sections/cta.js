// ============================================================
// sections/cta.js
// 하단 CTA 배너 (dark gradient 배경)
// props: onStartTrial
// ============================================================

window.CTASection = function CTASection({ onStartTrial }) {
  return (
    <section className="py-24 px-4 sm:px-6 section-gradient-dark text-white">
      <div className="max-w-3xl mx-auto text-center">

        <div className="text-4xl mb-6 animate-float inline-block">🤖</div>

        <h2 className="text-3xl sm:text-4xl font-extrabold mb-5">
          지금 바로 강비서를<br />
          <span className="gradient-text">무료로 경험해보세요</span>
        </h2>

        <p className="text-blue-200 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
          30일 동안 모든 기능을 무료로 사용해보세요.<br />
          신용카드 정보 없이 즉시 시작할 수 있습니다.
        </p>

        <button
          onClick={onStartTrial}
          className="btn-trial px-10 py-4 rounded-xl font-bold text-base
            inline-flex items-center gap-2"
        >
          30일 무료체험 시작하기
          <ArrowRightIcon size={20} />
        </button>

        <p className="mt-4 text-blue-300 text-sm">
          설치 없음 · 카드 불필요 · 언제든 해지
        </p>
      </div>
    </section>
  );
};
