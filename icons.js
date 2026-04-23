<!DOCTYPE html>
<!-- pages/lectures.html — 강비서 나의 강의 리스트 -->
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>나의 강의 리스트 | 강비서</title>

  <link rel="stylesheet" href="../css/reset.css" />
  <link rel="stylesheet" href="../css/variables.css" />
  <link rel="stylesheet" href="../css/common.css" />
  <link rel="stylesheet" href="../css/layout.css" />
  <link rel="stylesheet" href="../css/lectures.css" />
</head>
<body>

  <div class="app-shell">

    <!-- ════════════════════════════
         SIDEBAR
    ════════════════════════════ -->
    <aside class="sidebar" id="sidebar" aria-label="사이드바 네비게이션">
      <div class="sidebar-header">
        <a href="../index.html" class="sidebar-logo">강<span>비서</span></a>
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="사이드바 접기/펼치기">◀</button>
      </div>

      <div class="sidebar-user">
        <div class="sidebar-avatar" aria-hidden="true">김</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">김지수 강사</div>
          <div class="sidebar-user-role">프리랜서 강사</div>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="주요 메뉴">
        <div class="sidebar-nav-section">
          <div class="sidebar-nav-label">메인</div>
          <a href="home.html"     class="sidebar-nav-item" data-page="home.html">
            <span class="nav-icon">🏠</span><span class="nav-label">홈</span>
          </a>
          <a href="lectures.html" class="sidebar-nav-item active" data-page="lectures.html" aria-current="page">
            <span class="nav-icon">📋</span><span class="nav-label">나의 강의 리스트</span>
            <span class="nav-badge">2</span>
          </a>
          <a href="calendar.html" class="sidebar-nav-item" data-page="calendar.html">
            <span class="nav-icon">📅</span><span class="nav-label">강의 캘린더</span>
          </a>
        </div>
        <div class="sidebar-nav-section">
          <div class="sidebar-nav-label">계정</div>
          <a href="mypage.html" class="sidebar-nav-item" data-page="mypage.html">
            <span class="nav-icon">👤</span><span class="nav-label">마이 페이지</span>
          </a>
        </div>
      </nav>

      <div class="sidebar-footer">
        <a href="../login.html" class="sidebar-nav-item" id="logout-btn">
          <span class="nav-icon">🚪</span><span class="nav-label">로그아웃</span>
        </a>
      </div>
    </aside>

    <div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>


    <!-- ════════════════════════════
         MAIN
    ════════════════════════════ -->
    <div class="app-main" id="app-main">

      <!-- 탑바 -->
      <header class="topbar">
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="메뉴 열기">☰</button>
        <nav class="topbar-breadcrumb" aria-label="현재 위치">
          <span>강비서</span><span>›</span><span class="current">나의 강의 리스트</span>
        </nav>
        <div class="topbar-right">
          <span class="topbar-date" id="topbar-date"></span>
          <div class="topbar-notification" role="button" aria-label="알림" tabindex="0">
            🔔<span class="notification-dot"></span>
          </div>
        </div>
      </header>


      <main class="page-content">

        <!-- 페이지 헤더 -->
        <div class="lectures-header">
          <div class="lectures-header-left">
            <h1 class="page-title">나의 강의 리스트</h1>
            <p class="page-subtitle">등록된 전체 강의 일정과 정산 현황을 관리하세요.</p>
          </div>
          <div class="lectures-header-right">
            <button class="btn btn--primary" id="btn-add-lecture">
              ＋ 강의 추가
            </button>
          </div>
        </div>

        <!-- 상단 요약 칩 -->
        <div class="summary-chips" role="status" aria-label="강의 현황 요약">
          <span class="summary-chip summary-chip--total">
            <span class="summary-chip-icon">📋</span>
            <span id="chip-total">총 0건</span>
          </span>
          <span class="summary-chip summary-chip--fee">
            <span class="summary-chip-icon">💰</span>
            <span id="chip-fee">이번 달 강사료 계산 중</span>
          </span>
          <span class="summary-chip summary-chip--unpaid">
            <span class="summary-chip-icon">⚠️</span>
            <span id="chip-unpaid">미입금 0건</span>
          </span>
          <span class="summary-chip summary-chip--upcoming">
            <span class="summary-chip-icon">📅</span>
            <span id="chip-upcoming">예정 0건</span>
          </span>
        </div>

        <!-- 필터 탭 -->
        <div class="filter-tabs-bar" role="tablist" aria-label="강의 필터">
          <button class="filter-tab active" role="tab" aria-selected="true"  data-filter="all">
            전체 <span class="filter-tab-count">0</span>
          </button>
          <button class="filter-tab" role="tab" aria-selected="false" data-filter="urgent">
            🔥 준비 임박 <span class="filter-tab-count">0</span>
          </button>
          <button class="filter-tab" role="tab" aria-selected="false" data-filter="upcoming">
            📅 강의 예정 <span class="filter-tab-count">0</span>
          </button>
          <button class="filter-tab" role="tab" aria-selected="false" data-filter="doc">
            📄 서류 미비 <span class="filter-tab-count">0</span>
          </button>
          <button class="filter-tab" role="tab" aria-selected="false" data-filter="unpaid">
            💳 미입금 <span class="filter-tab-count">0</span>
          </button>
          <button class="filter-tab" role="tab" aria-selected="false" data-filter="done">
            ✅ 완료 <span class="filter-tab-count">0</span>
          </button>
        </div>

        <!-- 테이블 패널 -->
        <div class="table-panel">

          <!-- 툴바 -->
          <div class="table-toolbar">
            <span class="table-result-count" id="result-count">총 <strong>0</strong>건</span>
            <div class="table-search" role="search">
              <span class="table-search-icon">🔍</span>
              <input
                class="table-search-input"
                type="search"
                id="table-search"
                placeholder="강의명, 강의처, 장소 검색..."
                aria-label="강의 검색"
              />
            </div>
          </div>

          <!-- 테이블 -->
          <div class="lectures-table-wrap">
            <table class="lectures-table" aria-label="강의 목록">
              <thead>
                <tr>
                  <th scope="col" style="width:72px">날짜</th>
                  <th scope="col" style="width:96px">시간</th>
                  <th scope="col">강의 제목</th>
                  <th scope="col" style="width:140px">강의처</th>
                  <th scope="col" style="width:160px">장소</th>
                  <th scope="col" class="col-fee" style="width:100px">강사료</th>
                  <th scope="col" class="col-status" style="width:96px">상태</th>
                </tr>
              </thead>
              <tbody id="lectures-tbody">
                <!-- JS로 렌더링 -->
              </tbody>
            </table>
          </div>

        </div><!-- /.table-panel -->

      </main>
    </div><!-- /.app-main -->

  </div><!-- /.app-shell -->


  <!-- ══════════════════════════════════════
       DETAIL MODAL
  ══════════════════════════════════════ -->
  <div class="modal-backdrop" id="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal">

      <!-- 모달 헤더 -->
      <div class="modal-header">
        <div class="modal-title-block">
          <h2 class="modal-title" id="modal-title">강의 제목</h2>
          <div class="modal-meta-row">
            <span class="lec-badge" id="modal-badge"></span>
            <span class="modal-meta-item">📅 <span id="modal-date-meta"></span></span>
            <span class="modal-meta-item">🏢 <span id="modal-client-meta"></span></span>
          </div>
        </div>
        <button class="modal-close" id="modal-close-btn" aria-label="닫기">✕</button>
      </div>

      <!-- 모달 바디 -->
      <div class="modal-body">

        <!-- 부제목 -->
        <p style="font-size:var(--font-size-sm); color:var(--color-text-secondary); margin-top:-8px;" id="modal-subtitle"></p>

        <!-- 섹션 1: 기본 정보 -->
        <div class="modal-section">
          <div class="modal-section-title">기본 정보</div>
          <div class="modal-info-grid">
            <div class="modal-info-item">
              <div class="modal-info-label">강의 장소</div>
              <div class="modal-info-value" id="modal-place"></div>
            </div>
            <div class="modal-info-item">
              <div class="modal-info-label">주차 정보</div>
              <div class="modal-info-value" id="modal-parking"></div>
            </div>
            <div class="modal-info-item">
              <div class="modal-info-label">강의 시간</div>
              <div class="modal-info-value" id="modal-time"></div>
            </div>
            <div class="modal-info-item">
              <div class="modal-info-label">강사료</div>
              <div class="modal-info-value fee" id="modal-fee"></div>
            </div>
            <div class="modal-info-item">
              <div class="modal-info-label">입금 예정일</div>
              <div class="modal-info-value" id="modal-paiddate"></div>
            </div>
            <div class="modal-info-item">
              <div class="modal-info-label">입금 상태</div>
              <div class="modal-info-value" id="modal-paidstatus"></div>
            </div>
          </div>
        </div>

        <!-- 섹션 2: 담당자 정보 -->
        <div class="modal-section">
          <div class="modal-section-title">담당자 정보</div>
          <div class="modal-manager-card">
            <div class="modal-manager-avatar" id="modal-mgr-avatar"></div>
            <div class="modal-manager-info">
              <div class="modal-manager-name" id="modal-mgr-name"></div>
              <div class="modal-manager-sub" id="modal-mgr-sub"></div>
            </div>
            <div class="modal-manager-actions">
              <a class="modal-contact-btn" id="modal-mgr-phone" href="tel:">📞 전화</a>
              <a class="modal-contact-btn" id="modal-mgr-email" href="mailto:">✉️</a>
            </div>
          </div>
        </div>

        <!-- 섹션 3: 준비물 체크리스트 -->
        <div class="modal-section">
          <div class="modal-section-title">준비물 체크리스트</div>
          <div class="checklist" id="modal-checklist">
            <!-- JS로 렌더링 -->
          </div>
        </div>

        <!-- 섹션 4: 서류·세금 현황 -->
        <div class="modal-section">
          <div class="modal-section-title">서류 및 정산 현황</div>
          <div class="doc-status-grid">
            <div class="doc-status-item">
              <div class="doc-status-icon">📄</div>
              <div class="doc-status-name">결과보고서</div>
              <div id="modal-doc-report"></div>
            </div>
            <div class="doc-status-item">
              <div class="doc-status-icon">🧾</div>
              <div class="doc-status-name">청구서·견적서</div>
              <div id="modal-doc-invoice"></div>
            </div>
            <div class="doc-status-item">
              <div class="doc-status-icon">🏦</div>
              <div class="doc-status-name">세금계산서</div>
              <div id="modal-doc-taxbill"></div>
            </div>
          </div>
        </div>

        <!-- 섹션 5: 메모 -->
        <div class="modal-section">
          <div class="modal-section-title">메모 · 특이사항</div>
          <textarea
            class="modal-note"
            id="modal-memo"
            placeholder="강의 관련 특이사항, 요청사항 등을 자유롭게 기록하세요."
            rows="3"
          ></textarea>
        </div>

      </div><!-- /.modal-body -->

      <!-- 모달 푸터 -->
      <div class="modal-footer">
        <div class="modal-footer-left">
          <button class="btn--modal-delete" id="btn-modal-delete">🗑 삭제</button>
        </div>
        <div class="modal-footer-right">
          <button class="btn--modal-edit" id="btn-modal-edit">✏️ 수정</button>
          <button class="btn--modal-save" id="btn-modal-save">저장</button>
        </div>
      </div>

    </div><!-- /.modal -->
  </div><!-- /.modal-backdrop -->


  <!-- ══════════════════════════════════════
       CONFIRM DIALOG (삭제 확인)
  ══════════════════════════════════════ -->
  <div class="confirm-backdrop" id="confirm-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <div class="confirm-box">
      <div class="confirm-icon">🗑️</div>
      <h3 class="confirm-title" id="confirm-title">강의를 삭제하시겠어요?</h3>
      <p class="confirm-desc">
        삭제된 강의 데이터는 복구할 수 없습니다.<br />
        관련 정산 내역도 함께 삭제됩니다.
      </p>
      <div class="confirm-actions">
        <button class="btn--confirm-cancel" id="btn-confirm-cancel">취소</button>
        <button class="btn--confirm-delete" id="btn-confirm-delete">삭제하기</button>
      </div>
    </div>
  </div>


  <!-- ══════════════════════════════════════
       강의 추가 모달
  ══════════════════════════════════════ -->
  <div class="modal-backdrop" id="add-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-modal-title">
    <div class="modal" style="max-width:580px;">

      <div class="modal-header">
        <div class="modal-title-block">
          <h2 class="modal-title" id="add-modal-title">강의 추가</h2>
          <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:4px;">새 강의 일정을 등록하세요.</p>
        </div>
        <button class="modal-close" id="add-modal-close" aria-label="닫기">✕</button>
      </div>

      <div class="modal-body">
        <form id="add-lecture-form" novalidate>
          <div class="add-form-sections">

            <!-- 일정 정보 -->
            <div>
              <div class="add-form-section-title">일정 정보</div>
              <div class="add-form-grid add-form-grid--3">
                <div class="add-form-field" style="grid-column:1/2">
                  <label class="add-form-label" for="af-date">날짜 <span class="required">*</span></label>
                  <input class="add-form-input" type="date" id="af-date" required />
                </div>
                <div class="add-form-field">
                  <label class="add-form-label" for="af-time-start">시작 시간 <span class="required">*</span></label>
                  <input class="add-form-input" type="time" id="af-time-start" required />
                </div>
                <div class="add-form-field">
                  <label class="add-form-label" for="af-time-end">종료 시간 <span class="required">*</span></label>
                  <input class="add-form-input" type="time" id="af-time-end" required />
                </div>
              </div>
            </div>

            <!-- 강의 정보 -->
            <div>
              <div class="add-form-section-title">강의 정보</div>
              <div class="add-form-grid add-form-grid--full" style="gap:var(--space-3)">
                <div class="add-form-field">
                  <label class="add-form-label" for="af-title">강의명 <span class="required">*</span></label>
                  <input class="add-form-input" type="text" id="af-title" placeholder="예) AI 비즈니스 활용 특강" required />
                </div>
                <div class="add-form-grid">
                  <div class="add-form-field">
                    <label class="add-form-label" for="af-client">고객사 <span class="required">*</span></label>
                    <input class="add-form-input" type="text" id="af-client" placeholder="예) 삼성SDS" required />
                  </div>
                  <div class="add-form-field">
                    <label class="add-form-label" for="af-fee">강사료 (원) <span class="required">*</span></label>
                    <input class="add-form-input" type="number" id="af-fee" placeholder="예) 500000" min="0" required />
                  </div>
                </div>
                <div class="add-form-field">
                  <label class="add-form-label" for="af-place">강의 장소</label>
                  <input class="add-form-input" type="text" id="af-place" placeholder="예) 서울 강남구 SSDC 교육장 4F" />
                </div>
              </div>
            </div>

            <!-- 담당자 정보 -->
            <div>
              <div class="add-form-section-title">담당자 정보</div>
              <div class="add-form-grid">
                <div class="add-form-field">
                  <label class="add-form-label" for="af-manager-name">담당자 이름</label>
                  <input class="add-form-input" type="text" id="af-manager-name" placeholder="예) 홍길동" />
                </div>
                <div class="add-form-field">
                  <label class="add-form-label" for="af-manager-phone">담당자 연락처</label>
                  <input class="add-form-input" type="tel" id="af-manager-phone" placeholder="예) 010-1234-5678" />
                </div>
              </div>
            </div>

            <!-- 메모 -->
            <div>
              <div class="add-form-section-title">메모</div>
              <div class="add-form-field">
                <textarea class="add-form-input add-form-textarea" id="af-memo"
                  placeholder="특이사항, 준비물, 요청사항 등을 자유롭게 기록하세요." rows="3"></textarea>
              </div>
            </div>

          </div>
        </form>
      </div>

      <div class="modal-footer">
        <div class="modal-footer-left"></div>
        <div class="modal-footer-right">
          <button class="btn--add-cancel" id="add-modal-cancel">취소</button>
          <button class="btn--add-submit" id="add-modal-submit">저장하기</button>
        </div>
      </div>

    </div>
  </div>


  <!-- Scripts -->
  <script src="../js/common.js"></script>
  <script type="module" src="../js/pages/lectures.js"></script>
</body>
</html>
