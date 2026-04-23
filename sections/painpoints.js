// ============================================================
// sections/painpoints.js
// 강사의 3가지 고충 카드
// 데이터: APP_DATA.painPoints
// ============================================================

window.PainPointSection = function PainPointSection() {
  return (
    <section className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* 헤더 */}
        <div className="text-center mb-14">
          <Badge variant="blue" className="mb-4">강사님의 고충</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4 mt-3">
            이런 고민, 해본 적 있으신가요?
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            강비서는 강사님이 가장 많이 겪는 행정 업무의 불편함을 해결합니다.
          </p>
        </div>

        {/* 카드 3종 */}
        <div className="grid md:grid-cols-3 gap-6">
          {APP_DATA.painPoints.map(function(point, i) {
            return (
              <div key={i} className="pain-card bg-white rounded-2xl p-7 shadow-sm">
                <div className="text-3xl mb-4">{point.emoji}</div>
                <h3 className="text-lg font-bold text-slate-800 mb-3 leading-snug">
                  {point.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {point.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
