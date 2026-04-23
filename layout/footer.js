// ============================================================
// layout/footer.js
// 푸터: 링크 4열 + 저작권
// props: onContact
// ============================================================

window.Footer = function Footer({ onContact }) {
  var columns = [
    {
      heading: null,
      isLogo: true,
    },
    {
      heading: '서비스',
      links: [
        { label: '스마트 일정 조율', href: '#' },
        { label: '원클릭 강의 브리핑', href: '#' },
        { label: '스마트 강의 관리', href: '#' },
      ],
    },
    {
      heading: '요금제',
      links: [
        { label: '무료 체험', href: '#' },
        { label: '프로 플랜', href: '#' },
        { label: '엔터프라이즈', href: '#' },
      ],
    },
    {
      heading: '고객 지원',
      links: [
        { label: '문의하기', onClick: onContact },
        { label: '이용약관', href: '#' },
        { label: '개인정보처리방침', href: '#' },
      ],
    },
  ];

  return (
    <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">

        {/* 링크 그리드 */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {columns.map(function(col, idx) {
            if (col.isLogo) {
              return (
                <div key={idx}>
                  <div className="flex items-center gap-2 mb-4">
                    <Logo size={7} />
                  </div>
                  <p className="text-sm leading-relaxed">
                    강사님의 모든 행정 업무를 AI가 대신 처리합니다.
                  </p>
                </div>
              );
            }
            return (
              <div key={idx}>
                <h4 className="text-white font-semibold text-sm mb-4">{col.heading}</h4>
                <ul className="space-y-2 text-sm">
                  {col.links.map(function(link, i) {
                    if (link.onClick) {
                      return (
                        <li key={i}>
                          <button
                            onClick={link.onClick}
                            className="hover:text-white transition-colors"
                          >
                            {link.label}
                          </button>
                        </li>
                      );
                    }
                    return (
                      <li key={i}>
                        <a href={link.href}
                          className="hover:text-white transition-colors">
                          {link.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* 하단 카피라이트 */}
        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row
          justify-between items-center gap-3 text-xs">
          <span>© 2025 강비서. All rights reserved.</span>
          <span>AI 기반 강사 비서 서비스</span>
        </div>
      </div>
    </footer>
  );
};
