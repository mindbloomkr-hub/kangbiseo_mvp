// ============================================================
// pages/dashboard-page.js
// 대시보드: 탭별 기능 분리 및 2026년 업데이트 버전
// ============================================================

window.DashboardPage = function DashboardPage({ onLogout, onGoHome }) {
  var [activeMenu, setActiveMenu] = React.useState('schedule');

  var MENU_ITEMS = [
   // { id: 'home',       emoji: '🏠', label: '홈' },
    { id: 'schedule',   emoji: '📅', label: '일정 조율'    },
    { id: 'briefing',   emoji: '📋', label: '강의 브리핑'  },
    { id: 'lectures',   emoji: '📚', label: '강의 관리'    },
    { id: 'payment',    emoji: '💰', label: '정산 트래킹'  },
  ];

  var activeLabel = (MENU_ITEMS.find(function(m) { return m.id === activeMenu; }) || {});

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ── 사이드바 ───────────────────────────────────────── */}
      <aside className="dashboard-sidebar w-60 flex-shrink-0 hidden md:flex flex-col">
        {/* 로고 */}
        <div className="px-6 py-9 border-b border-slate-50 flex items-center justify-start">
          <div className="flex items-center gap-3 w-full">
            <img 
              src="logo_white.png" 
              alt="강비서 로고" 
              className="h-11 w-auto max-w-full object-contain" 
            />
          </div>
        </div>

        {/* 사용자 정보 */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-400 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">강</div>
            <div>
              <div className="text-white text-sm font-semibold">강비서 강사님</div>
              <div className="text-blue-300 text-xs">프로 플랜 · 2026년형</div>
            </div>
          </div>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 px-3 py-4">
          {MENU_ITEMS.map(function(item) {
            return (
              <button
                key={item.id}
                
                  onClick={function() { 
                  // 1. 이미 열려있는 메뉴를 또 눌렀는지 확인
                  if (activeMenu === item.id) {
                    console.log("신호를 보냅니다: RESET_DASHBOARD");
                    // 2. 대시보드 파일(mvp-dashboard.js)에 리셋 신호를 보냄
                    window.dispatchEvent(new CustomEvent('RESET_DASHBOARD'));
                  }
                  // 3. 메뉴 변경 (기존 로직)
                  setActiveMenu(item.id); 
                }}
                
                className={'w-full flex items-center gap-4 px-4 py-3.5 rounded-lg ' + 
                  'font-bold mb-2 transition-all ' + 
                  (activeMenu === item.id
                    ? 'bg-white/15 text-white shadow-inner text-lg' 
                    : 'text-blue-200 hover:bg-white/8 hover:text-white text-sm')}
              >
                <span className="text-lg">{item.emoji}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* 하단 액션 */}
        <div className="px-3 pb-5 space-y-1 border-t border-white/10 pt-4">
          <button onClick={onGoHome} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-300 hover:text-white hover:bg-white/8">서비스 소개</button>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-300 hover:text-white hover:bg-white/8"><LogoutIcon size={15} /> 로그아웃</button>
        </div>
      </aside>

      {/* ── 메인 콘텐츠 ────────────────────────────────────── */}
      <main className="flex-1 overflow-auto flex flex-col">

        {/* 상단 헤더 바 */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">
              {activeLabel.emoji} {activeLabel.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="blue">프로 체험 중</Badge>
            <button onClick={onLogout} className="p-2 rounded-lg text-slate-400 hover:text-slate-600"><LogoutIcon size={18} /></button>
          </div>
        </header>

        {/* 탭별 콘텐츠 렌더링 영역 */}
        <div className="flex-1 overflow-auto">
          
          {/* 1. 일정 조율: 기존 MVPDashboard 그대로 유지 */}
          {activeMenu === 'schedule' && (
            <div className="bg-slate-950 min-h-full">
              <MVPDashboard />
            </div>
          )}

          {/* 2. 강의 브리핑: 준비 중 */}
          {activeMenu === 'briefing' && (
            <div className="p-20 text-center animate-fadeIn">
              <div className="text-4xl mb-4 text-slate-300">📋</div>
              <p className="text-slate-500 text-sm font-bold">강의 브리핑 기능 준비 중</p>
              <p className="text-slate-400 text-xs mt-2">오늘의 동선과 강의 큐시트를 자동으로 정리해 드릴 예정입니다.</p>
            </div>
          )}

          {/* 3. 강의 관리: 준비 중 */}
          {activeMenu === 'lectures' && (
            <div className="p-20 text-center animate-fadeIn">
              <div className="text-4xl mb-4 text-slate-300">📚</div>
              <p className="text-slate-500 text-sm font-bold">강의 관리 기능 준비 중</p>
              <p className="text-slate-400 text-xs mt-2">전체 강의 이력을 한눈에 보고 필터링할 수 있는 기능을 준비하고 있습니다.</p>
            </div>
          )}

          {/* 4. 정산 트래킹: 준비 중 */}
          {activeMenu === 'payment' && (
            <div className="p-20 text-center animate-fadeIn">
              <div className="text-4xl mb-4 text-slate-300">💰</div>
              <p className="text-slate-500 text-sm font-bold">정산 트래킹 기능 준비 중</p>
              <p className="text-slate-400 text-xs mt-2">미입금 강의료 확인과 수익 통계를 자동화하고 있습니다.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};