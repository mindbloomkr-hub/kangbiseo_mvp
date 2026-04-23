// ============================================================
// app.js
// 최상위 App 컴포넌트
//   - 전역 상태: isLoggedIn / isSubscribed / currentPage
//   - 모달 제어: showLogin / showContact / loginMode
//   - 페이지 라우팅: 'home' | 'dashboard'
// 모든 하위 컴포넌트가 window.* 로 등록된 이후 마지막에 로드
// ============================================================

var App = function App() {
  var [isLoggedIn,   setIsLoggedIn]   = React.useState(false);
  var [isSubscribed, setIsSubscribed] = React.useState(false);
  var [currentPage,  setCurrentPage]  = React.useState('home');
  var [showLogin,    setShowLogin]    = React.useState(false);
  var [showContact,  setShowContact]  = React.useState(false);
  var [loginMode,    setLoginMode]    = React.useState('login');

  /* ── 페이지 이동 ──────────────────────────────────────── */
  function navigateTo(page) {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── 무료체험 시작 ────────────────────────────────────── */
  function handleStartTrial() {
    if (isLoggedIn) {
      setIsSubscribed(true);
      navigateTo('dashboard');
    } else {
      setLoginMode('signup');
      setShowLogin(true);
    }
  }

  /* ── 로그인 버튼 클릭 ─────────────────────────────────── */
  function handleLoginClick() {
    setLoginMode('login');
    setShowLogin(true);
  }

  /* ── 로그인 / 회원가입 성공 ───────────────────────────── */
  function handleLoginSuccess() {
    setIsLoggedIn(true);
    setIsSubscribed(true);
    setShowLogin(false);
    navigateTo('dashboard');
  }

  /* ── 로그아웃 ─────────────────────────────────────────── */
  function handleLogout() {
    setIsLoggedIn(false);
    setIsSubscribed(false);
    navigateTo('home');
  }

  /* ── 대시보드 내비게이션 (GNB 로고 등) ───────────────── */
  function handleNavigateDashboard(page) {
    if (isSubscribed) navigateTo(page);
  }

  var isDashboard = currentPage === 'dashboard';

  return (
    <>
      {/* GNB: 대시보드에선 자체 사이드바가 있으므로 숨김 */}
      {!isDashboard && (
        <Navbar
          isLoggedIn={isLoggedIn}
          isSubscribed={isSubscribed}
          onLogin={handleLoginClick}
          onContact={function() { setShowContact(true); }}
          onStartTrial={handleStartTrial}
          onNavigateDashboard={handleNavigateDashboard}
          onLogout={handleLogout}
        />
      )}

      {/* 페이지 본문 (GNB 높이만큼 상단 패딩) */}
      <div className={!isDashboard ? 'pt-16' : ''}>
        {currentPage === 'home' && (
          <HomePage
            onStartTrial={handleStartTrial}
            onContact={function() { setShowContact(true); }}
          />
        )}
        {currentPage === 'dashboard' && (
          <DashboardPage
            onLogout={handleLogout}
            onGoHome={function() { navigateTo('home'); }}
          />
        )}
      </div>

      {/* 모달 레이어 */}
      {showLogin && (
        <LoginModal
          mode={loginMode}
          onClose={function() { setShowLogin(false); }}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
      {showContact && (
        <ContactModal onClose={function() { setShowContact(false); }} />
      )}
    </>
  );
};

/* ── React 마운트 ─────────────────────────────────────────── */
var rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(<App />);
