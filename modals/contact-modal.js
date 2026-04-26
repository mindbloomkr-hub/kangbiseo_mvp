// ============================================================
// modals/contact-modal.js
// 문의하기 모달 (폼 → 발송 완료 상태 전환)
// props: onClose
// ============================================================

// 1. 없는 아이콘을 간단한 텍스트나 SVG로 대체 정의 (임시방편)
const XIcon = () => React.createElement('span', { style: { fontSize: '20px', fontWeight: 'bold' } }, '×');
const SendIcon = () => React.createElement('span', null, '✈️'); // 혹시 전송 아이콘도 없다면 대비

window.ContactModal = function ContactModal({ onClose }) {
  var [name,    setName]    = React.useState('');
  var [email,   setEmail]   = React.useState('');
  var [message, setMessage] = React.useState('');
  var [loading, setLoading] = React.useState(false);
  var [sent,    setSent]    = React.useState(false);

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleSubmit(e) {
      e.preventDefault();
      setLoading(true);

      try {
        // 1. Firebase Firestore에 저장
        await window.addDoc(window.collection(window.db, "contacts"), {
          name: name,
          email: email,
          message: message,
          timestamp: window.serverTimestamp()
        });


        // 1. 대표님(관리자)에게 알림 메일 쏘기
        await emailjs.send(
          "service_pwwd65q", 
          "template_rp8powo", 
          {
            from_name: name,
            from_email: email,
            message: message
          },
          "xuhCaxPrcaS7xO6we"
        );

        // 2. 문의한 사람에게 자동 답장 쏘기
        await emailjs.send(
          "service_pwwd65q",
          "template_mz7qmvc",
          {
            from_name: name,
            from_email: email,
            message: message
          },
          "xuhCaxPrcaS7xO6we"
        );

        setLoading(false);
        setSent(true); // 성공 화면으로 전환

      } catch (error) {
        console.error("전송 에러:", error);
        alert("전송 중 오류가 발생했습니다: " + error.message);
        setLoading(false);
      }
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
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button 
                onClick={onClose} 
                className="btn btn--primary"
                style={{ minWidth: '100px' }}
              >
                확인
              </button>
            </div>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button 
                  type="submit" 
                  className="btn btn--primary" 
                  disabled={loading}
                  style={{ minWidth: '120px' }} // 버튼이 너무 작아 보이면 최소 너비를 살짝 줍니다
                >
                  {loading ? '전송 중...' : '문의 보내기'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
