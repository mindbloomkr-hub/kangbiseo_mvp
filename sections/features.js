// ============================================================
// sections/features.js — v2.0 (MVP 실무 기능 시각화)
// 핵심 기능 3종 탭 UI + 실제 대시보드 로직 반영 MockUI
// ============================================================

/* ── 오른쪽 패널: MVP 실제 로직 반영 목업 ─────────────────────── */
var FeatureMockUI = function FeatureMockUI({ featureId }) {
  
/* 1. 스마트 일정 조율 (출발/도착 상세 정보 추가) */
  if (featureId === 'schedule') {
    return (
      <div className="w-full max-w-sm space-y-4 animate-slideInRight">
        {/* 상단: AI 진단 현황 */}
        <div className="glass-card rounded-[2.5rem] p-6 border border-white/20 shadow-2xl bg-white/5 backdrop-blur-md">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-red-400 text-[10px] font-black tracking-widest uppercase mb-1">Route Diagnostic</p>
              <h4 className="text-white font-black text-lg">동선 정밀 분석 결과</h4>
            </div>
            <div className="bg-red-500/20 px-3 py-1 rounded-full border border-red-500/30">
              <span className="text-red-500 text-[10px] font-black animate-pulse">⚠️ 지각 위험</span>
            </div>
          </div>

          {/* 💡 추가: 상세 동선 경로 (출발 -> 도착) */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                <div className="w-0.5 h-6 bg-gradient-to-b from-blue-400 to-red-400"></div>
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white/40 text-[9px] font-bold">START (종료)</p>
                    <p className="text-white text-xs font-bold">강남 해커스 본원</p>
                  </div>
                  <span className="text-white/60 font-mono text-xs">12:00</span>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white/40 text-[9px] font-bold">DEST (시작)</p>
                    <p className="text-white text-xs font-bold">기흥 IBK연수원</p>
                  </div>
                  <span className="text-white/60 font-mono text-xs font-black">14:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* 타임라인 바 */}
          <div className="relative h-2 w-full bg-white/10 rounded-full mb-8 overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-[40%] bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
            <div className="absolute left-[40%] top-0 h-full w-[50%] bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]"></div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
              <p className="text-white/40 text-[9px] font-bold mb-1">🚗 예상 이동 시간</p>
              <p className="text-white font-black">75분 <span className="text-[10px] font-normal opacity-50 text-blue-300">정체반영</span></p>
            </div>
            <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
              <p className="text-white/40 text-[9px] font-bold mb-1">⚙️ 안정적인 강의를 위한 버퍼시간</p>
              <p className="text-white font-black">60분 </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span className="text-white/60 text-xs font-bold">부족한 여유 시간</span>
            </div>
            <span className="text-red-400 font-black text-xl">-15분</span>
          </div>
        </div>

        {/* 하단 AI 제안 */}
        <div className="glass-card rounded-2xl p-4 bg-blue-600 shadow-[0_20px_40px_rgba(37,99,235,0.3)] flex items-center gap-4 border border-blue-400/50">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
             <BotIcon size={20} color="white" />
          </div>
          <div className="flex-1">
            <p className="text-white/70 text-[10px] font-bold">강비서의 대안 제안</p>
            <p className="text-white font-black text-xs">"14:15분 시작으로 시간 보정할까요?"</p>
          </div>
        </div>
      </div>
    );
  }

/* 2. 올인원 강의 관리 (4월 전체 일정 & 상태별 컬러 대시보드) */
  if (featureId === 'management') {
    // 4월 실무 데이터 시뮬레이션
    var aprilLectures = [
      { date: '04.03', org: 'LG CNS', title: 'DX 전략 워크숍', status: '진행 완료', color: 'emerald', tag: '컨설팅' },
      { date: '04.08', org: '삼성전자', title: '반도체 사업부 특강', status: '진행 예정', color: 'blue', tag: '특강' },
      { date: '04.15', org: 'KB금융그룹', title: '신입사원 연수', status: '진행 예정', color: 'blue', tag: '교육' },
      { date: '04.21', org: '카카오뱅크', title: '리더십 코칭', status: '섭외 논의 중', color: 'orange', tag: '코칭' },
      { date: '04.24', org: '해커스 HRD', title: '취업 전략 특강', status: '섭외 논의 중', color: 'orange', tag: '특강' },
      { date: '04.28', org: '현대자동차', title: '차세대 리더 과정', status: '입금 대기', color: 'indigo', tag: '워크샵' }
    ];

    return (
      <div className="w-full max-w-sm space-y-4 animate-slideInRight">
        {/* 상단 헤더: 월간 요약 */}
        <div className="flex justify-between items-end px-2 mb-2">
          <div>
            <p className="text-blue-400 text-[10px] font-black tracking-widest uppercase">Dashboard</p>
            <h4 className="text-white font-black text-xl">4월 강의 스케줄</h4>
          </div>
          <div className="text-right">
            <span className="text-white/40 text-[10px] font-mono">Total 12 Lectures</span>
          </div>
        </div>
        
        {/* 강의 리스트 영역: 스크롤 가능한 느낌을 주는 고밀도 리스트 */}
        <div className="space-y-2 max-h-[380px] overflow-hidden relative">
          {/* 하단 페이드 효과 (더 있다는 느낌) */}
          <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-navy-900 to-transparent z-10"></div>
          
          {aprilLectures.map((item, idx) => (
            <div key={idx} className="glass-card rounded-2xl p-3 flex items-center gap-3 border border-white/5 hover:bg-white/10 transition-all cursor-pointer group">
              {/* 날짜 박스 */}
              <div className="text-center w-12 border-r border-white/10 pr-3">
                <p className="text-white/40 text-[9px] font-bold uppercase">{item.date.split('.')[0]}월</p>
                <p className="text-white font-black text-sm">{item.date.split('.')[1]}</p>
              </div>

              {/* 강의 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <p className="text-white font-bold text-[13px] truncate group-hover:text-blue-300 transition-colors">
                    {item.org} <span className="text-white/40 font-normal text-[11px] ml-1">| {item.title}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded bg-${item.color}-500/20 text-${item.color}-400 border border-${item.color}-500/30`}>
                    {item.status}
                  </span>
                  <span className="text-white/30 text-[10px]">#{item.tag}</span>
                </div>
              </div>

              {/* 상태 인디케이터 */}
              <div className={`w-1 h-8 rounded-full bg-${item.color}-500 shadow-[0_0_8px_rgba(var(--tw-color-${item.color}-500),0.4)]`}></div>
            </div>
          ))}
        </div>

        {/* 하단 요약 카드 (대시보드 핵심 지표) */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="glass-card rounded-2xl p-4 bg-white/5 border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">💰</div>
            <p className="text-white/40 text-[9px] font-black uppercase mb-1">4월 예상 수익</p>
            <p className="text-white font-black text-lg">₩7,450,000</p>
          </div>
          <div className="glass-card rounded-2xl p-4 bg-white/5 border border-white/10 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-2 opacity-10">📈</div>
            <p className="text-white/40 text-[9px] font-black uppercase mb-1">강의 가동률</p>
            <p className="text-white font-black text-lg">82% <span className="text-[10px] text-emerald-400 ml-1">▲ 12%</span></p>
          </div>
        </div>
      </div>
    );
  }

/* 3. 원클릭 강의 브리핑 (실무 정보 풀패키지 컨셉) */
  if (featureId === 'briefing') {
    return (
      <div className="w-full max-w-sm animate-slideInRight">
        <div className="glass-card rounded-[2.5rem] border border-white/20 p-6 shadow-2xl bg-[#0f172a]/80 backdrop-blur-xl relative overflow-hidden">
          
          {/* 상단 헤더: 분석 완료 상태 */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/40">
                <BotIcon size={20} color="white" />
              </div>
              <div>
                <h4 className="text-white font-black text-base">강의 브리핑 리포트</h4>
                <p className="text-emerald-400 text-[9px] font-black tracking-widest uppercase">Analysis Complete</p>
              </div>
            </div>
            <span className="text-white/30 text-[10px] font-mono">ID: 260415-BX</span>
          </div>

          <div className="space-y-4">
            {/* 1. 핵심 일시 및 기관 */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
              <div className="flex justify-between items-start mb-2">
                <span className="text-blue-400 text-[10px] font-black uppercase">Schedule & Client</span>
                <span className="bg-blue-500/20 text-blue-300 text-[9px] px-2 py-0.5 rounded-md font-bold">D-Day</span>
              </div>
              <p className="text-white font-black text-lg mb-1">삼성전자 서초사옥 특강</p>
              <p className="text-white/80 text-sm font-bold">4월 24일(금) 14:00 – 17:00 <span className="text-white/40 font-normal ml-1">(3h)</span></p>
            </div>

            {/* 2. 상세 장소 및 주차 (강사님 필수 정보) */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
              <span className="text-blue-400 text-[10px] font-black uppercase mb-2 block">Location & Parking</span>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-white/40 text-xs">📍</span>
                  <p className="text-white text-xs font-bold leading-tight">본관 5층 창의협업실 (대회의실 A)</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-white/40 text-xs">🚗</span>
                  <p className="text-emerald-400 text-xs font-bold leading-tight">지하 4층 C구역 주차 시 전용 승강기 연결 <br/><span className="text-[10px] font-normal opacity-80">(무료 주차권 담당자 수령)</span></p>
                </div>
              </div>
            </div>

            {/* 3. 담당자 및 연락처 (바로 걸기 컨셉) */}
            <div className="flex gap-3">
              <div className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/5">
                <span className="text-blue-400 text-[10px] font-black uppercase mb-1 block">Contact</span>
                <p className="text-white font-bold text-xs mb-1">이지훈 교육팀장</p>
                <p className="text-white/40 text-[10px] font-mono">010-9876-5432</p>
              </div>
              <div className="w-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 cursor-pointer active:scale-95 transition-transform">
                <PhoneIcon size={24} color="white" />
              </div>
            </div>

            {/* 4. AI 특이사항 (노하우/보안) */}
            <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-orange-500 text-xs">⚡</span>
                <span className="text-orange-500 text-[10px] font-black uppercase">AI Special Notes</span>
              </div>
              <ul className="text-[11px] text-white/80 space-y-1 font-medium leading-snug">
                <li>• 보안 구역: <span className="text-white font-bold underline decoration-orange-500">신분증 지참 필수</span> (노트북 반입 가능)</li>
                <li>• 다과 제공: 강사용 별도 커피 및 케이터링 준비됨</li>
                <li>• 지난 피드백: "실습 비중을 높여달라"는 요청 있었음</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
};



/* ── 핵심 기능 섹션 (탭 UI) ─────────────────────────────── */
window.FeaturesSection = function FeaturesSection() {
  var [activeTab, setActiveTab] = React.useState(0);
  var features = APP_DATA.features;
  var active   = features[activeTab];

  return (
    <section className="py-24 px-4 sm:px-6 bg-slate-50">
      <div className="max-w-6xl mx-auto">

        {/* 헤더 */}
        <div className="text-center mb-16">
          <Badge variant="blue">SYSTEM FEATURES</Badge>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-6 mt-4 tracking-tight">
            강사님의 시간을 지키는 <br className="hidden sm:block" /> 강비서의 정교한 로직
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">
            현직 강사의 페인 포인트를 정확히 해결하기 위해 <br /> 이동 시간 1분, 준비 시간 10분까지 집요하게 계산합니다.
          </p>
        </div>

        {/* 탭 버튼: MVP 디자인 아이덴티티 반영 */}
        <div className="flex flex-wrap justify-center gap-4 mb-16">
          {features.map(function(f, i) {
            return (
              <button
                key={f.id}
                onClick={function() { setActiveTab(i); }}
                className={'flex items-center gap-3 px-8 py-4 rounded-[2rem] text-sm font-black transition-all duration-300 ' +
                  (activeTab === i
                    ? 'bg-navy-900 text-white shadow-2xl shadow-navy-900/40 scale-105'
                    : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50')}
              >
                <span className="text-xl">{f.emoji}</span>
                {f.title}
              </button>
            );
          })}
        </div>

        {/* 기능 상세 카드: 대시보드 느낌의 디자인 */}
        <div key={active.id} className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/60 overflow-hidden animate-scaleIn border border-slate-100">
          <div className="grid lg:grid-cols-2 gap-0">

            {/* 좌: 텍스트 정보 */}
            <div className="p-12 lg:p-20 flex flex-col justify-center">
              <span className="text-6xl mb-8 inline-block">{active.emoji}</span>
              <h3 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
                {active.title}
              </h3>
              <p className="text-blue-600 font-bold mb-6 text-lg">{active.subtitle}</p>
              <p className="text-slate-500 leading-relaxed mb-10 text-lg font-medium">{active.description}</p>
              
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {active.highlights.map(function(h) {
                  return (
                    <li key={h} className="flex items-center gap-3 text-sm font-bold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                      <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-200">
                        <CheckIcon size={12} color="white" />
                      </div>
                      {h}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 우: MockUI - 실제 앱 구동 화면처럼 연출 */}
            <div className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800
              p-12 lg:p-20 flex items-center justify-center relative overflow-hidden">
              {/* 장식용 배경 광원 */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]"></div>
              
              <FeatureMockUI featureId={active.id} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};