// ============================================================
// sections/pricing.js
// 요금제 카드 3종 (무료체험 / 프로 / 엔터프라이즈)
// 데이터: APP_DATA.pricing
// props: onStartTrial, onContact
// ============================================================

window.PricingSection = function PricingSection({ onStartTrial, onContact }) {
  return (
    <section className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* 헤더 */}
        <div className="text-center mb-14">
          <Badge variant="green">요금제</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4 mt-3">
            합리적인 가격, 강력한 기능
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            30일 무료 체험으로 먼저 경험해보세요. 언제든지 해지 가능합니다.
          </p>
        </div>

        {/* 카드 그리드 */}
        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {APP_DATA.pricing.map(function(plan) {
            var isHighlight = plan.highlighted;
            var isEnterprise = plan.id === 'enterprise';

            return (
              <div
                key={plan.id}
                className={'rounded-3xl overflow-hidden flex flex-col card-hover ' +
                  (isHighlight
                    ? 'pricing-card-highlight text-white shadow-2xl'
                    : 'bg-white border border-slate-200 shadow-md text-slate-800')}
              >
                {/* Most Popular 리본 */}
                {isHighlight && (
                  <div className="bg-yellow-400 text-yellow-900 text-xs font-extrabold
                    text-center py-2 tracking-widest uppercase">
                    🌟 Most Popular
                  </div>
                )}

                <div className="p-8 flex-1 flex flex-col">
                  {/* 플랜명 */}
                  <div className={'text-sm font-bold uppercase tracking-widest mb-3 ' +
                    (isHighlight ? 'text-blue-200' : 'text-navy-700')}>
                    {plan.name}
                  </div>

                  {/* 가격 */}
                  {isEnterprise ? (
                    <span className={'text-2xl font-extrabold mb-2 ' +
                      (isHighlight ? 'text-white' : 'text-slate-900')}>
                      별도 문의
                    </span>
                  ) : (
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className={'text-4xl font-black ' +
                        (isHighlight ? 'text-white' : 'text-slate-900')}>
                        {plan.price === '0' ? '무료' : '₩' + plan.price}
                      </span>
                      {plan.period && (
                        <span className={'text-sm ' +
                          (isHighlight ? 'text-blue-200' : 'text-slate-400')}>
                          {plan.period}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 설명 */}
                  <p className={'text-sm mb-6 ' +
                    (isHighlight ? 'text-blue-100' : 'text-slate-500')}>
                    {plan.description}
                  </p>

                  {/* 기능 목록 */}
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map(function(f) {
                      return (
                        <li key={f} className="flex items-center gap-3 text-sm">
                          <span className={'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ' +
                            (isHighlight ? 'bg-white/20' : 'bg-navy-100')}>
                            <CheckIcon size={11} color={isHighlight ? '#ffffff' : '#1e40af'} />
                          </span>
                          <span className={isHighlight ? 'text-blue-50' : 'text-slate-700'}>
                            {f}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* CTA 버튼 */}
                  <button
                    onClick={isEnterprise ? onContact : onStartTrial}
                    className={'w-full py-3.5 rounded-xl font-bold text-sm transition-all ' +
                      (isHighlight
                        ? 'bg-white text-navy-800 hover:bg-blue-50'
                        : isEnterprise
                        ? 'btn-outline'
                        : 'btn-primary text-white')}
                  >
                    {plan.cta}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
