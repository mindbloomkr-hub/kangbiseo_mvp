// ============================================================
// modals/login-modal.js
// 로그인 / 회원가입 탭 모달
// props: mode('login'|'signup'), onClose, onLoginSuccess
// ============================================================

window.LoginModal = function LoginModal({ mode, onClose, onLoginSuccess }) {
  var [tab,      setTab]      = React.useState(mode || 'login');
  var [email,    setEmail]    = React.useState('');
  var [password, setPassword] = React.useState('');
  var [name,     setName]     = React.useState('');
  var [loading,  setLoading]  = React.useState(false);

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setTimeout(function() {
      setLoading(false);
      onLoginSuccess();
    }, 1200);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-box w-full max-w-md mx-4 p-8 relative">

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
            rounded-full hover:bg-slate-100 transition-colors text-slate-400"
        >
          <XIcon size={18} />
        </button>

        {/* 로고 + 서비스명 */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 w-20 h-12">
            <Logo size={20} />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">강비서</h2>
        </div>

        {/* 로그인 / 무료 시작 탭 */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          {[['login', '로그인'], ['signup', '회원가입']].map(function(item) {
            return (
              <button
                key={item[0]}
                onClick={function() { setTab(item[0]); }}
                className={'flex-1 py-2 rounded-lg text-sm font-semibold transition-all ' +
                  (tab === item[0]
                    ? 'bg-white text-navy-800 shadow-sm'
                    : 'text-slate-500')}
              >
                {item[1]}
              </button>
            );
          })}
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">이름</label>
              <input
                type="text"
                className="input-field"
                placeholder="강사님 성함"
                value={name}
                onChange={function(e) { setName(e.target.value); }}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">이메일</label>
            <input
              type="email"
              className="input-field"
              placeholder="example@email.com"
              value={email}
              onChange={function(e) { setEmail(e.target.value); }}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">비밀번호</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={function(e) { setPassword(e.target.value); }}
              required
            />
          </div>

          {tab === 'signup' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
              ✓ 30일 무료 체험 · 신용카드 불필요 · 언제든지 해지 가능
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3.5 rounded-xl font-bold text-white
              flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading
              ? <><SpinnerIcon size={18} /> 처리 중...</>
              : tab === 'login'
              ? '로그인'
              : '30일 무료체험 시작하기'}
          </button>
        </form>

        {/* 탭 전환 링크 */}
        {tab === 'login' && (
          <div className="mt-4 text-center">
            <button
              onClick={function() { setTab('signup'); }}
              className="text-xs text-slate-500 hover:text-navy-700 transition-colors"
            >
              계정이 없으신가요?{' '}
              <span className="font-semibold text-navy-700">무료로 시작하기</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
