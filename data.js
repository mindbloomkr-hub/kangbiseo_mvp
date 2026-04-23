// 💡 [수정됨] 첫 줄 괄호 안에 props를 추가했습니다!
window.DemoSection = function DemoSection(props) {
  const [step, setStep] = React.useState('start'); // 'start', 'analyzing', 'result', 'resolved'
  const [selectedOption, setSelectedOption] = React.useState(null);

  const [showLoginModal, setShowLoginModal] = React.useState(false);

  const startAnalysis = () => {
    setStep('analyzing');
    setTimeout(() => setStep('result'), 2500); 
  };

  const resolve = (opt) => {
    setSelectedOption(opt);
    setStep('resolved');
  };

  return (
    <section className="py-24 bg-[#0a0f1e] text-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        
        {/* 헤더 부분 */}
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-black tracking-widest mb-4">
            INTERACTIVE EXPERIENCE
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-6 tracking-tight">
            강비서의 판단력을 <br className="sm:hidden" /> 직접 확인해보세요
          </h2>
          <p className="text-slate-400 text-lg font-medium">코치님의 실제 하루를 가정한 리얼 타임 시뮬레이션입니다.</p>
        </div>

        {/* 메인 데모 스테이지 */}
        <div className="bg-white/5 border border-white/10 rounded-[3rem] p-6 md:p-12 backdrop-blur-3xl relative shadow-2xl">
          
          {/* [Step 1] 상황 발생: 왼쪽(기본일정 달력) + 오른쪽(새로운 의뢰) */}
          {step === 'start' && (
            <div className="grid lg:grid-cols-2 gap-12 items-center animate-fadeIn">
              
              {/* 왼쪽: 현재 코치님의 일정 (미니 달력 형태) */}
              <div className="space-y-4">
                <p className="text-blue-400 text-xs font-black uppercase tracking-widest pl-2">Current Schedule</p>
                <div className="bg-[#151b2d] rounded-[2rem] p-6 border border-white/5 shadow-inner">
                  <div className="flex justify-between items-center mb-6">
                    <span className="font-black text-lg text-slate-200">4월 15일 (수)</span>
                    <span className="text-[10px] bg-blue-600 px-2 py-1 rounded-md">오늘</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex gap-4">
                      <div className="text-slate-500 text-xs font-mono pt-1 w-10">10:00</div>
                      <div className="flex-1 p-4 bg-blue-600/20 border border-blue-500/30 rounded-2xl">
                        <p className="font-black text-sm text-blue-100">강남 해커스 본원 강의</p>
                        <p className="text-[10px] text-blue-300/70 mt-1">확정됨 · 12:00 종료</p>
                      </div>
                    </div>
                    <div className="flex gap-4 opacity-30">
                      <div className="text-slate-500 text-xs font-mono pt-1 w-10">14:00</div>
                      <div className="flex-1 h-20 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center">
                        <span className="text-[10px] font-bold">비어있는 시간</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 오른쪽: 새로운 섭외 요청 */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-white/10 to-white/5 p-8 rounded-[2.5rem] border border-white/10 shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                      <PhoneIcon size={20} color="#f97316" />
                    </div>
                    <div>
                      <p className="text-orange-400 text-[10px] font-black uppercase">New Inquiry</p>
                      <p className="font-black text-lg">기흥 IBK연수원 의뢰</p>
                    </div>
                  </div>
                  <div className="space-y-4 text-sm text-slate-300 font-medium">
                    <div className="flex justify-between">
                      <span className="opacity-50">담당자</span>
                      <span className="text-white">박민수 과장님</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-50">강의 시간</span>
                      <span className="text-white underline underline-offset-4 decoration-orange-500">14:00 – 17:00 (3시간)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-50">장소</span>
                      <span className="text-white">기흥 IBK연수원 (자차이동)</span>
                    </div>
                  </div>
                </div>
                <button onClick={startAnalysis} className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-[1.5rem] font-black text-lg shadow-xl shadow-blue-600/30 transition-all hover:-translate-y-1 active:scale-95">
                  강비서에게 분석 맡기기 🔍
                </button>
              </div>
            </div>
          )}

          {/* [Step 2] 분석 중: 더 구체적인 메시지 */}
          {step === 'analyzing' && (
            <div className="py-24 text-center animate-fadeIn">
              <div className="w-20 h-20 border-[6px] border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-8 shadow-2xl shadow-blue-600/20"></div>
              <p className="text-2xl font-black text-blue-400 mb-2">실시간 동선 시뮬레이션 중</p>
              <div className="flex flex-col gap-1 text-white/40 font-bold text-sm">
                <span>📍 강남 해커스 → 기흥 IBK연수원</span>
                <span>🚗 카카오 내비 실시간 정체 구간 반영 중...</span>
                <span>⚙️ 강의 전후 골든타임 60분 계산 중...</span>
              </div>
            </div>
          )}

          {/* [Step 3] 분석 결과: 상세 리포트 */}
          {step === 'result' && (
            <div className="animate-slideUp max-w-2xl mx-auto space-y-8">
              <div className="text-center">
                <div className="inline-block px-4 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-500 text-xs font-black mb-4 tracking-widest">ANALYSIS REPORT</div>
                <h3 className="text-3xl font-black text-red-500 mb-2">⚠️ 지각 위험 (15분 부족)</h3>
                <p className="text-slate-400 font-medium">정리 및 준비 시간을 포함해 총 135분이 필요하지만, 현재 120분만 확보 가능합니다.</p>
              </div>
              
              {/* 상세 타임라인 리포트 */}
              <div className="bg-[#1a2035] rounded-[2.5rem] p-8 border border-red-500/20 shadow-2xl">
                <div className="space-y-6">
                  {/* 구간 1: 이전 강의 정리 */}
                  <div className="flex items-start gap-4">
                    <div className="w-2 h-10 rounded-full bg-slate-700 mt-1"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-bold">강남 해커스 종료 및 정리</span>
                        <span className="font-mono text-slate-400">12:00 – 12:30</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">※ 마무리 및 장비 정리 (30분 소요)</p>
                    </div>
                  </div>

                  {/* 구간 2: 이동 시간 */}
                  <div className="flex items-start gap-4">
                    <div className="w-2 h-10 rounded-full bg-blue-500 mt-1"></div>
                    <div className="flex-1">
                      <div className="flex justify-between font-black text-blue-400">
                        <span>기흥 IBK연수원 이동 (자차)</span>
                        <span>12:30 – 13:45</span>
                      </div>
                      <p className="text-[10px] text-blue-500/70 mt-1">※ 카카오 내비 실시간 정체 반영 (75분 소요)</p>
                    </div>
                  </div>

                  {/* 구간 3: 도착 및 세팅 */}
                  <div className="flex items-start gap-4">
                    <div className="w-2 h-10 rounded-full bg-orange-500 mt-1"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="text-orange-400 font-bold">도착 후 강의 세팅</span>
                        <span className="font-mono text-orange-400">13:45 – 14:15</span>
                      </div>
                      <p className="text-[10px] text-orange-500/70 mt-1">※ 강의장 세팅 및 담당자 미팅 (30분 필요)</p>
                    </div>
                  </div>

                  {/* 결과 요약 박스 */}
                  <div className="pt-6 border-t border-white/5 space-y-4">
                    <div className="flex justify-between items-center bg-red-500/10 p-5 rounded-2xl border border-red-500/20">
                      <div>
                        <p className="text-red-500 font-black text-lg">최종 15분 지각 예상</p>
                        <p className="text-red-400/60 text-[10px]">강의 시작(14:00) 대비 준비 완료 시점(14:15)이 늦습니다.</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">필요 시간: 135분</span>
                        <span className="text-xs text-red-400 block font-bold">확보 시간: 120분</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 해결 버튼 (기존과 동일) */}
              <div className="grid md:grid-cols-2 gap-4">
                <button onClick={() => resolve('A')} className="p-6 bg-white/5 border border-white/10 rounded-[2rem] hover:border-blue-500 hover:bg-blue-600/10 transition-all text-left group">
                  <p className="text-blue-400 font-black text-xs mb-1">Option A. 시간 보정</p>
                  <p className="text-white font-black text-lg">14:15 이후 시작으로 제안</p>
                  <p className="text-slate-500 text-[10px] mt-2 group-hover:text-slate-300">"준비 시간 30분을 온전히 확보합니다"</p>
                </button>
                <button onClick={() => resolve('B')} className="p-6 bg-white/5 border border-white/10 rounded-[2rem] hover:border-emerald-500 hover:bg-emerald-600/10 transition-all text-left group">
                  <p className="text-emerald-400 font-black text-xs mb-1">Option B. 날짜 제안</p>
                  <p className="text-white font-black text-lg">다음주 수요일로 제안</p>
                  <p className="text-slate-500 text-[10px] mt-2 group-hover:text-slate-300">"가장 여유로운 프리슬롯을 추천합니다"</p>
                </button>
              </div>

              <div className="mt-12 text-center animate-fadeIn">
                <div className="inline-block bg-gradient-to-r from-blue-50 to-indigo-50 p-8 rounded-[3rem] border border-blue-100 shadow-lg">
                  <h3 className="text-2xl font-black text-slate-900 mb-2">내 강의 일정도 안전할까? 🤔</h3>
                  <p className="text-slate-500 font-bold mb-6">지금 바로 강비서 MVP에서 직접 일정을 입력하고 동선을 검토해 보세요!</p>
                  
                  <button 
                    onClick={function() { setShowLoginModal(true); }} // 👈 클릭 시 스위치 ON!
                    className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-full font-black text-xl shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center gap-2 mx-auto"
                  >
                    <span>🚀 강비서 MVP 무료로 시작하기</span>
                    <span className="text-blue-200">→</span>
                  </button>

                  {/* 💡 [수정됨] onLoginSuccess 3중 방어 로직 적용 */}
                  {showLoginModal && (
                    <LoginModal 
                      mode="login"
                      onClose={function() { setShowLoginModal(false); }} 
                      onLoginSuccess={function() {
                        // 1. 모달 닫기
                        setShowLoginModal(false); 
                        
                        // 2. 대시보드로 이동 (3중 방어)
                        if (props && typeof props.setActiveMenu === 'function') {
                          props.setActiveMenu('일정 조율'); // 최우선: 부모가 넘겨준 함수
                        } else if (typeof window.setActiveMenu === 'function') {
                          window.setActiveMenu('일정 조율'); // 차선: 전역 함수
                        } else {
                          // 최후의 수단: 전역 이벤트 강제 발송
                          window.dispatchEvent(new CustomEvent('NAVIGATE_TO', { detail: '일정 조율' }));
                          window.dispatchEvent(new CustomEvent('RESET_DASHBOARD')); // 혹시 몰라 기존 신호도 쏩니다
                        }
                      }} 
                    />
                  )}
                </div>
              </div>

            </div>
          )}

          {/* [Step 4] 해결 완료 */}
          {step === 'resolved' && (
            <div className="text-center py-10 animate-scaleIn">
              <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/40">
                <CheckIcon size={48} color="white" />
              </div>
              <h3 className="text-4xl font-black mb-4 tracking-tight">전략적인 섭외 대응 완료!</h3>
              <p className="text-slate-400 mb-10 max-w-lg mx-auto text-lg font-medium leading-relaxed">
                {selectedOption === 'A' ? "시간 조정을 통해 '품격 있는 준비 시간'을 확보했습니다." : "가장 최적의 날짜로 제안하여 코치님의 전문성을 지켰습니다."}
                <br/><span className="text-blue-400">데이터가 코치님의 거절을 세련된 제안으로 바꿉니다.</span>
              </p>
              <button onClick={() => setStep('start')} className="px-10 py-4 bg-white/10 hover:bg-white/20 rounded-[1.5rem] font-black text-sm transition-all">
                다른 상황 테스트하기
              </button>
            </div>
          )}
        </div>

      </div>
    </section>
  );
};