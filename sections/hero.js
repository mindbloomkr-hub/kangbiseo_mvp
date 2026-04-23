// ============================================================
// sections/hero.js
// 히어로 배너: 메인 카피 / CTA 버튼 / Trust badges
// props: onStartTrial, onContact
// ============================================================

window.HeroSection = function HeroSection({ onStartTrial }) {
  function scrollToDemo(e) {
    e.preventDefault();
    var el = document.getElementById('demo-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <section className="hero-gradient pt-28 pb-24 px-4 sm:px-6 text-white relative overflow-hidden">

      {/* 배경 장식 blob */}
      <div style={{
        position: 'absolute', top: '-80px', right: '-80px',
        width: '360px', height: '360px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-60px', left: '-60px',
        width: '280px', height: '280px',
        background: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />

      <div className="max-w-5xl mx-auto text-center relative z-10">

        {/* 상단 뱃지 */}
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20
          rounded-full px-4 py-1.5 text-sm mb-8 animate-fadeIn">
          <span className="animate-float inline-block">🤖</span>
          <span className="font-medium">AI가 대신하는 강사 비서 서비스</span>
        </div>

        {/* 메인 카피 */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight
          mb-6 animate-slideUp text-balance">
          강의에만 집중하세요.<br />
          <span className="gradient-text">나머지는 강비서가</span><br />
          알아서 합니다.
        </h1>

        <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto
          mb-10 animate-slideUp delay-200 leading-relaxed">
          스마트한 일정 조율부터 AI 강의 브리핑, 엑셀이 필요 없는 올인원 강의 관리까지.<br className="hidden sm:block" />
          강사님의 모든 행정 업무를 AI가 자동으로 처리합니다.
        </p>

        {/* CTA 버튼 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slideUp delay-300">
          <button
            onClick={onStartTrial}
            className="btn-trial px-8 py-4 rounded-xl text-base font-bold
              inline-flex items-center justify-center gap-2"
          >
            30일 무료체험 시작하기
            <ArrowRightIcon size={18} />
          </button>
          <button
            onClick={scrollToDemo}
            className="px-8 py-4 rounded-xl text-base font-semibold
              border border-white/30 hover:bg-white/10 transition-all
              inline-flex items-center justify-center gap-2"
          >
            ▶ 데모 체험하기
          </button>
        </div>

        {/* Trust badges */}
        <div className="mt-14 flex flex-wrap justify-center gap-6
          text-blue-200 text-sm animate-slideUp delay-400">
          {['신용카드 불필요', '설치 없이 바로 사용', '언제든지 해지 가능'].map(function(txt) {
            return (
              <span key={txt} className="flex items-center gap-1.5">
                <CheckIcon size={14} color="#93c5fd" /> {txt}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
};
