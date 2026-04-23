// ============================================================
// layout/navbar.js
// GNB: 로고 / 문의하기·로그인·무료체험 버튼 / 반응형 모바일 메뉴
// props: isLoggedIn, isSubscribed, onLogin, onContact,
//        onStartTrial, onNavigateDashboard, onLogout
// ============================================================

window.Navbar = function Navbar({
  isLoggedIn,
  isSubscribed,
  onLogin,
  onContact,
  onStartTrial,
  onNavigateDashboard,
  onLogout,
}) {
  var [scrolled, setScrolled]     = React.useState(false);
  var [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(function() {
    function handleScroll() { setScrolled(window.scrollY > 20); }
    window.addEventListener('scroll', handleScroll);
    return function() { window.removeEventListener('scroll', handleScroll); };
  }, []);

  function handleLogoClick(e) {
    e.preventDefault();
    if (isSubscribed) { onNavigateDashboard('home'); }
  }

  /* ── 공통 버튼 묶음 (데스크톱/모바일 공유) ────────────── */
  function renderButtons(isMobile) {
    var baseClass = isMobile
      ? 'w-full py-2.5 rounded-lg text-sm font-semibold text-center'
      : '';

    if (isLoggedIn) {
      return (
        <>
          {isSubscribed && (
            <button
              onClick={function() { onNavigateDashboard('dashboard'); setMobileOpen(false); }}
              className={'btn-outline px-4 py-2 rounded-lg text-sm font-medium ' + baseClass}
            >
              대시보드
            </button>
          )}
          <button
            onClick={function() { onLogout(); setMobileOpen(false); }}
            className={'btn-ghost flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-500 ' + baseClass}
          >
            <LogoutIcon size={15} />
            로그아웃
          </button>
        </>
      );
    }

    return (
      <>
        <button
          onClick={function() { onContact(); setMobileOpen(false); }}
          className={'btn-ghost px-4 py-2 rounded-lg text-sm font-medium ' + baseClass}
        >
          문의하기
        </button>
        <button
          onClick={function() { onLogin(); setMobileOpen(false); }}
          className={'btn-outline px-4 py-2 rounded-lg text-sm font-medium ' + baseClass}
        >
          로그인
        </button>
        <button
          onClick={function() { onStartTrial(); setMobileOpen(false); }}
          className={'btn-trial px-5 py-2 rounded-lg text-sm font-semibold ' + baseClass}
        >
          30일 무료체험 시작하기
        </button>
      </>
    );
  }

  return (
    <nav className={'nav-glass fixed top-0 left-0 right-0 z-50 ' + (scrolled ? 'scrolled' : '')}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* 로고 */}
          <a href="#" onClick={handleLogoClick}
            className="flex items-center gap-2.5 group">
            <div className="group-hover:ring-2 ring-navy-400 rounded-lg transition-all">
              <Logo size={15} />
            </div>
           {/*} <span className="font-bold text-lg text-navy-900 tracking-tight">강비서</span>*/}
          </a>

          {/* 데스크톱 버튼 */}
          <div className="hidden md:flex items-center gap-2">
            {renderButtons(false)}
          </div>

          {/* 모바일 햄버거 */}
          <button
            className="md:hidden btn-ghost p-2 rounded-lg"
            onClick={function() { setMobileOpen(function(v) { return !v; }); }}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4
          animate-slideDown flex flex-col gap-3">
          {renderButtons(true)}
        </div>
      )}
    </nav>
  );
};
