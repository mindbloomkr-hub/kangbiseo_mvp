/* css/login.css */

/* ════════════════════════════════
   PAGE LAYOUT
════════════════════════════════ */
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

/* ── 왼쪽: 브랜드 패널 ── */
.login-brand-panel {
  position: relative;
  background: linear-gradient(150deg, var(--color-primary-900) 0%, var(--color-primary-700) 60%, var(--color-primary-500) 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--space-10) var(--space-12);
  overflow: hidden;
}

.login-brand-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 80% 20%, rgba(14,165,233,0.2) 0%, transparent 65%),
    radial-gradient(ellipse 50% 60% at 10% 90%, rgba(37,99,196,0.3) 0%, transparent 60%);
  pointer-events: none;
}

.brand-panel-content {
  position: relative;
  z-index: 1;
}

.brand-logo {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-extrabold);
  color: var(--color-white);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-16);
}

.brand-logo span {
  color: var(--color-accent-400);
}

.brand-headline {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-extrabold);
  color: var(--color-white);
  line-height: var(--line-height-tight);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-5);
}

.brand-headline em {
  font-style: normal;
  color: var(--color-accent-400);
}

.brand-desc {
  font-size: var(--font-size-base);
  color: rgba(255, 255, 255, 0.7);
  line-height: var(--line-height-relaxed);
  max-width: 340px;
  margin-bottom: var(--space-12);
}

/* 브랜드 패널 기능 포인트 */
.brand-features {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.brand-feature-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-feature-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.brand-feature-text {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.8);
  font-weight: var(--font-weight-medium);
}

/* 브랜드 패널 하단 통계 */
.brand-panel-footer {
  position: relative;
  z-index: 1;
  display: flex;
  gap: var(--space-8);
  padding-top: var(--space-8);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.brand-stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.brand-stat-value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-extrabold);
  color: var(--color-white);
  line-height: 1;
}

.brand-stat-label {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.5);
}

/* ── 오른쪽: 폼 패널 ── */
.login-form-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: var(--space-10) var(--space-16);
  background: var(--color-white);
  overflow-y: auto;
}

.form-panel-inner {
  width: 100%;
  max-width: 400px;
}

/* 모바일 로고 (브랜드 패널 숨김 시 표시) */
.mobile-logo {
  display: none;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-extrabold);
  color: var(--color-primary-700);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-8);
}

.mobile-logo span {
  color: var(--color-primary-500);
}

/* ════════════════════════════════
   TAB SWITCHER
════════════════════════════════ */
.auth-tabs {
  display: flex;
  background: var(--color-gray-100);
  border-radius: var(--radius-lg);
  padding: 4px;
  margin-bottom: var(--space-8);
  gap: 4px;
}

.auth-tab-btn {
  flex: 1;
  height: 40px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  border-radius: var(--radius-md);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-base);
}

.auth-tab-btn.active {
  background: var(--color-white);
  color: var(--color-primary-600);
  box-shadow: var(--shadow-sm);
}

.auth-tab-btn:hover:not(.active) {
  color: var(--color-text-secondary);
}

/* ════════════════════════════════
   FORM PANEL HEADER
════════════════════════════════ */
.form-header {
  margin-bottom: var(--space-8);
}

.form-header-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-extrabold);
  color: var(--color-gray-900);
  letter-spacing: -0.02em;
  line-height: var(--line-height-tight);
  margin-bottom: var(--space-2);
}

.form-header-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  line-height: var(--line-height-relaxed);
}

/* ════════════════════════════════
   AUTH FORMS
════════════════════════════════ */
.auth-form {
  display: none;
  flex-direction: column;
  gap: var(--space-5);
}

.auth-form.active {
  display: flex;
}

/* 폼 내부 버튼 (제출) */
.btn--form-submit {
  width: 100%;
  height: 50px;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  background: var(--color-primary-500);
  color: var(--color-white);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  box-shadow: var(--shadow-primary);
  transition: all var(--transition-base);
  margin-top: var(--space-2);
}

.btn--form-submit:hover {
  background: var(--color-primary-700);
  transform: translateY(-1px);
  box-shadow: 0 10px 28px rgba(37, 99, 196, 0.35);
}

.btn--form-submit:active {
  transform: translateY(0);
}

/* 로딩 상태 */
.btn--form-submit.is-loading {
  opacity: 0.7;
  cursor: not-allowed;
  pointer-events: none;
}

/* 비밀번호 옵션 행 (기억하기 + 찾기) */
.form-options-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-link {
  font-size: var(--font-size-sm);
  color: var(--color-primary-500);
  font-weight: var(--font-weight-medium);
  transition: color var(--transition-fast);
}

.form-link:hover {
  color: var(--color-primary-700);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 이름 + 전화번호 가로 배치 */
.form-row-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

/* ════════════════════════════════
   PASSWORD STRENGTH
════════════════════════════════ */
.pw-strength-bar {
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-gray-200);
  overflow: hidden;
  margin-top: var(--space-2);
}

.pw-strength-fill {
  height: 100%;
  border-radius: var(--radius-full);
  width: 0%;
  transition: width 0.4s ease, background 0.4s ease;
}

.pw-strength-fill[data-level="1"] { width: 25%; background: var(--color-danger-600); }
.pw-strength-fill[data-level="2"] { width: 50%; background: var(--color-warning-600); }
.pw-strength-fill[data-level="3"] { width: 75%; background: var(--color-accent-500); }
.pw-strength-fill[data-level="4"] { width: 100%; background: var(--color-success-600); }

.pw-strength-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

/* ════════════════════════════════
   SOCIAL LOGIN SECTION
════════════════════════════════ */
.social-login-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ════════════════════════════════
   SWITCH PROMPT (탭 하단 전환 안내)
════════════════════════════════ */
.auth-switch-prompt {
  text-align: center;
  margin-top: var(--space-6);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.auth-switch-prompt a {
  color: var(--color-primary-500);
  font-weight: var(--font-weight-semibold);
  margin-left: var(--space-1);
  transition: color var(--transition-fast);
}

.auth-switch-prompt a:hover {
  color: var(--color-primary-700);
}

/* 뒤로 가기 */
.back-to-landing {
  position: absolute;
  top: var(--space-6);
  left: var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: rgba(255, 255, 255, 0.6);
  transition: color var(--transition-fast);
  z-index: 2;
}

.back-to-landing:hover {
  color: var(--color-white);
}

/* ════════════════════════════════
   INPUT ICONS (SVG inline)
════════════════════════════════ */
.icon-user::before    { content: '👤'; }
.icon-lock::before    { content: '🔒'; }
.icon-mail::before    { content: '✉️'; }
.icon-phone::before   { content: '📱'; }
.icon-id::before      { content: '🪪'; }

/* ════════════════════════════════
   TOAST NOTIFICATION
════════════════════════════════ */
.toast {
  position: fixed;
  bottom: var(--space-8);
  left: 50%;
  transform: translateX(-50%) translateY(120%);
  background: var(--color-gray-900);
  color: var(--color-white);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-toast);
  white-space: nowrap;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

.toast.show {
  transform: translateX(-50%) translateY(0);
}

.toast--error   { background: var(--color-danger-600); }
.toast--success { background: var(--color-success-600); }

/* ════════════════════════════════
   RESPONSIVE
════════════════════════════════ */
@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-brand-panel {
    display: none;
  }

  .login-form-panel {
    padding: var(--space-10) var(--space-6);
    justify-content: flex-start;
    padding-top: var(--space-16);
  }

  .mobile-logo {
    display: block;
  }

  .back-to-landing {
    color: var(--color-primary-500);
  }
}

@media (max-width: 480px) {
  .form-row-2col {
    grid-template-columns: 1fr;
  }

  .form-panel-inner {
    max-width: 100%;
  }
}
