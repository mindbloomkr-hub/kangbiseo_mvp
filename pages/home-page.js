// ============================================================
// pages/home-page.js
// 랜딩 페이지: 섹션 컴포넌트를 순서대로 조립
// props: onStartTrial, onContact
// ============================================================

window.HomePage = function HomePage({ onStartTrial, onContact }) {
  return (
    <>
      <HeroSection     onStartTrial={onStartTrial} onContact={onContact} />
      <PainPointSection />
      <FeaturesSection />
      <DemoSection />
    {/* 랜딩페이지 하단 가격 보여주는거 숨김 처리 */}
    {/*  <PricingSection  onStartTrial={onStartTrial} onContact={onContact} /> */}
      <CTASection      onStartTrial={onStartTrial} />
      <Footer          onContact={onContact} />
    </>
  );
};
