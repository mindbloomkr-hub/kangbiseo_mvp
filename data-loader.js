<!DOCTYPE html>
<!-- pages/home.html — 강비서 홈(대시보드) -->
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>홈 | 강비서</title>

  <!-- Styles -->
  <link rel="stylesheet" href="../css/reset.css" />
  <link rel="stylesheet" href="../css/variables.css" />
  <link rel="stylesheet" href="../css/common.css" />
  <link rel="stylesheet" href="../css/layout.css" />
  <link rel="stylesheet" href="../css/home.css" />
</head>
<body>

  <!-- ══════════════════════════════════════
       APP SHELL
  ══════════════════════════════════════ -->
  <div class="app-shell">

    <!-- ════════════════════════════
         SIDEBAR (GNB)
    ════════════════════════════ -->
    <aside class="sidebar" id="sidebar" aria-label="사이드바 네비게이션">

      <!-- 로고 + 토글 -->
      <div class="sidebar-header">
        <a href="../index.html" class="sidebar-logo">강<span>비서</span></a>
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="사이드바 접기/펼치기">
          ◀
        </button>
      </div>

      <!-- 유저 박스 -->
      <div class="sidebar-user">
        <div class="sidebar-avatar" aria-hidden="true">김</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">김지수 강사</div>
          <div class="sidebar-user-role">프리랜서 강사</div>
        </div>
      </div>

      <!-- 메뉴 -->
      <nav class="sidebar-nav" aria-label="주요 메뉴">

        <div class="sidebar-nav-section">
          <div class="sidebar-nav-label">메인</div>

          <!-- 0. 홈 -->
          <a href="home.html"
             class="sidebar-nav-item active"
             data-page="home.html"
             aria-current="page">
            <span class="nav-icon">🏠</span>
            <span class="nav-label">홈</span>
          </a>

          <!-- 1. 나의 강의 리스트 -->
          <a href="lectures.html"
             class="sidebar-nav-item"
             data-page="lectures.html">
            <span class="nav-icon">📋</span>
            <span class="nav-label">나의 강의 리스트</span>
            <span class="nav-badge" aria-label="미입금 1건">1</span>
          </a>

          <!-- 2. 강의 캘린더 -->
          <a href="calendar.html"
             class="sidebar-nav-item"
             data-page="calendar.html">
            <span class="nav-icon">📅</span>
            <span class="nav-label">강의 캘린더</span>
          </a>
        </div>

        <div class="sidebar-nav-section">
          <div class="sidebar-nav-label">계정</div>

          <!-- 9. 마이 페이지 -->
          <a href="mypage.html"
             class="sidebar-nav-item"
             data-page="mypage.html">
            <span class="nav-icon">👤</span>
            <span class="nav-label">마이 페이지</span>
          </a>
        </div>

      </nav>

      <!-- 로그아웃 -->
      <div class="sidebar-footer">
        <a href="../login.html" class="sidebar-nav-item" id="logout-btn">
          <span class="nav-icon">🚪</span>
          <span class="nav-label">로그아웃</span>
        </a>
      </div>

    </aside>

    <!-- 모바일 오버레이 -->
    <div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>


    <!-- ════════════════════════════
         MAIN CONTENT
    ════════════════════════════ -->
    <div class="app-main" id="app-main">

      <!-- 탑바 -->
      <header class="topbar">
        <!-- 모바일 햄버거 -->
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="메뉴 열기">☰</button>

        <!-- 브레드크럼 -->
        <nav class="topbar-breadcrumb" aria-label="현재 위치">
          <span>강비서</span>
          <span>›</span>
          <span class="current">홈</span>
        </nav>

        <!-- 우측 영역 -->
        <div class="topbar-right">
          <span class="topbar-date" id="topbar-date"></span>
          <div class="topbar-notification" role="button" aria-label="알림 1건" tabindex="0">
            🔔
            <span class="notification-dot"></span>
          </div>
        </div>
      </header>


      <!-- 페이지 콘텐츠 -->
      <main class="page-content">

        <!-- ── 환영 헤더 ── -->
        <div class="page-header">
          <h1 class="page-title" id="greeting-text">안녕하세요 👋</h1>
          <p class="page-subtitle" id="greeting-subtitle">오늘의 강의 일정을 확인해 보세요.</p>
        </div>

        <!-- ── 통계 요약 바 ── -->
        <div class="stat-bar" id="stat-bar" aria-label="오늘의 현황 요약">
          <!-- JS로 렌더링 -->
        </div>

        <!-- ══════════════════════════════════════
             메인 2열 그리드
             좌: 강의 브리핑 + 투두 / 우: 타임스케줄
        ══════════════════════════════════════ -->
        <div class="home-grid">

          <!-- ── 좌측 컬럼: 브리핑(상) + 투두(하) ── -->
          <div class="home-col-left">

            <!-- 오늘의 강의 브리핑 -->
            <section class="panel" aria-labelledby="briefing-heading">
              <div class="panel-header">
                <h2 class="panel-title" id="briefing-heading">
                  <span class="panel-title-icon">📌</span>
                  오늘의 강의 브리핑
                </h2>
                <a href="lectures.html" class="panel-action">전체 보기 →</a>
              </div>
              <div class="panel-body">
                <div class="lecture-briefing-list" id="briefing-list">
                  <!-- JS로 렌더링 -->
                </div>
              </div>
            </section>

            <!-- 오늘의 할 일 -->
            <section class="panel" aria-labelledby="todo-heading">
              <div class="panel-header">
                <h2 class="panel-title" id="todo-heading">
                  <span class="panel-title-icon">✅</span>
                  오늘의 할 일
                </h2>
              </div>
              <div class="panel-body">
                <div class="todo-input-row">
                  <input
                    class="todo-input"
                    type="text"
                    id="todo-input"
                    placeholder="할 일을 입력하세요"
                    maxlength="80"
                    aria-label="할 일 입력"
                  />
                  <button class="todo-add-btn" id="todo-add-btn" aria-label="추가">+</button>
                </div>
                <div class="todo-list" id="todo-list" role="list" aria-label="할 일 목록">
                  <!-- JS로 렌더링 -->
                </div>
                <div class="todo-footer">
                  <span class="todo-count" id="todo-count"></span>
                  <span class="todo-clear-btn" id="todo-clear-done" role="button" tabindex="0">완료 항목 삭제</span>
                </div>
              </div>
            </section>

          </div><!-- /.home-col-left -->


          <!-- ── 우측 컬럼: 오늘의 타임스케줄 ── -->
          <div class="home-col-right">

            <section class="panel" aria-labelledby="timeline-heading">
              <div class="panel-header">
                <h2 class="panel-title" id="timeline-heading">
                  <span class="panel-title-icon">⏱</span>
                  오늘의 타임스케줄
                </h2>
                <a href="calendar.html" class="panel-action">캘린더 →</a>
              </div>
              <div class="panel-body">
                <div class="timeline-wrapper" id="timeline-list" aria-label="오늘 일정 타임라인">
                  <!-- JS로 렌더링 -->
                </div>
              </div>
            </section>

          </div><!-- /.home-col-right -->

        </div><!-- /.home-grid -->


        <!-- ══════════════════════════════════════
             하단 풀위드: 이번 주 일정
        ══════════════════════════════════════ -->
        <div class="home-full-row">
          <section class="panel" aria-labelledby="weekly-heading">
            <div class="panel-header">
              <h2 class="panel-title" id="weekly-heading">
                <span class="panel-title-icon">📆</span>
                이번 주 일정
              </h2>
              <a href="calendar.html" class="panel-action">캘린더 전체 보기 →</a>
            </div>
            <div class="panel-body">
              <!-- 7일 컬럼 그리드 (JS 렌더링) -->
              <div class="weekly-day-grid" id="weekly-day-grid" aria-label="이번 주 강의 일정">
              </div>
            </div>
            <!-- 주간 요약 바 -->
            <div class="weekly-summary-bar" id="weekly-summary">
              <!-- JS로 렌더링 -->
            </div>
          </section>
        </div><!-- /.home-full-row -->

      </main>
    </div><!-- /.app-main -->

  </div><!-- /.app-shell -->


  <!-- Scripts: common 먼저 로드 후 home -->

  <script type="module" src="../js/pages/home.js"></script>
</body>
</html>
