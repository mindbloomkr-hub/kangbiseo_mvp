// ============================================================
// modals/contact-modal.js
// 문의하기 모달 (폼 → 발송 완료 상태 전환)
// props: onClose
// ============================================================

window.ContactModal = function ContactModal({ onClose }) {
  var [name,    setName]    = React.useState('');
  var [email,   setEmail]   = React.useState('');
  var [message, setMessage] = React.useState('');
  var [loading, setLoading] = React.useState(false);
  var [sent,    setSent]    = React.useState(false);

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setTimeout(function() {
      setLoading(false);
      setSent(true);
    }, 1200);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-box w-full max-w-lg mx-4 p-8 relative">

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
            rounded-full hover:bg-slate-100 transition-colors text-slate-400"
        >
          <XIcon size={18} />
        </button>

        {/* 발송 완료 상태 */}
        {sent ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-2">
              문의가 접수되었습니다
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              영업일 1~2일 내에 이메일로 답변 드리겠습니다.
            </p>
            <button
              onClick={onClose}
              className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
            >
              확인
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">문의하기</h2>
            <p className="text-slate-500 text-sm mb-6">
              궁금한 점이나 도입 문의를 남겨주시면 빠르게 답변드리겠습니다.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">이름</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="홍길동"
                    value={name}
                    onChange={function(e) { setName(e.target.value); }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">이메일</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="email@example.com"
                    value={email}
                    onChange={function(e) { setEmail(e.target.value); }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  문의 내용
                </label>
                <textarea
                  className="textarea-field"
                  rows="5"
                  placeholder="문의하실 내용을 자유롭게 작성해 주세요."
                  value={message}
                  onChange={function(e) { setMessage(e.target.value); }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 rounded-xl font-bold text-white
                  flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading
                  ? <><SpinnerIcon size={18} /> 전송 중...</>
                  : '문의 보내기'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
