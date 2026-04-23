/* css/mypage.css — 마이 페이지 전용 스타일 */

/* ════════════════════════════════
   PAGE LAYOUT
════════════════════════════════ */
.mypage-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-6);
  align-items: start;
}

/* ── 좌측: 네비게이션 사이드바 ── */
.mypage-nav {
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-3);
  position: sticky;
  top: calc(var(--topbar-height, 60px) + var(--space-6));
}

.mypage-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}

.mypage-nav-item:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
}

.mypage-nav-item.active {
  background: var(--color-primary-50);
  color: var(--color-primary-500);
  font-weight: var(--font-weight-semibold);
}

.mypage-nav-icon {
  font-size: 1.1rem;
  width: 22px;
  text-align: center;
  flex-shrink: 0;
}

/* ── 우측: 섹션 스택 ── */
.mypage-sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ════════════════════════════════
   SECTION CARD
════════════════════════════════ */
.mypage-card {
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  scroll-margin-top: calc(var(--topbar-height, 60px) + var(--space-4));
}

.mypage-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.mypage-card-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  background: var(--color-primary-50);
  color: var(--color-primary-500);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
}

.mypage-card-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
}

.mypage-card-desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-top: 2px;
}

.mypage-card-body {
  padding: var(--space-6);
}

.mypage-card-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

/* ════════════════════════════════
   FORM ROWS
════════════════════════════════ */
.mp-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4) var(--space-5);
}

.mp-form-row--3col {
  grid-template-columns: 1fr 1fr 1fr;
}

.mp-form-row--single {
  grid-template-columns: 1fr;
}

.mp-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.mp-field + .mp-field {
  /* handled by grid gap */
}

.mp-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.mp-label-hint {
  font-weight: var(--font-weight-regular);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  margin-left: var(--space-1);
}

.mp-input {
  height: 42px;
  padding: 0 var(--space-3);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background: var(--color-white);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  font-family: var(--font-family-base);
  width: 100%;
  box-sizing: border-box;
}

.mp-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.mp-input::placeholder {
  color: var(--color-text-muted);
}

.mp-textarea {
  padding: var(--space-3);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background: var(--color-white);
  resize: vertical;
  min-height: 72px;
  font-family: var(--font-family-base);
  line-height: var(--line-height-relaxed);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  width: 100%;
  box-sizing: border-box;
}

.mp-textarea:focus {
  outline: none;
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.mp-input-prefix {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-white);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  height: 42px;
}

.mp-input-prefix:focus-within {
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.mp-prefix-label {
  padding: 0 var(--space-3);
  background: var(--color-bg-muted);
  border-right: 1.5px solid var(--color-border);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
  height: 100%;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.mp-input-prefix .mp-input {
  border: none;
  box-shadow: none;
  height: 100%;
  border-radius: 0;
}

.mp-input-prefix .mp-input:focus {
  box-shadow: none;
}

.mp-divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--space-5) 0;
}

/* ════════════════════════════════
   SECTION 1: 프로필
════════════════════════════════ */
.profile-edit-area {
  display: flex;
  align-items: flex-start;
  gap: var(--space-6);
  margin-bottom: var(--space-5);
}

.profile-photo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.profile-photo {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--color-primary-100);
  border: 3px solid var(--color-primary-200);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  font-weight: var(--font-weight-bold);
  color: var(--color-primary-600);
  overflow: hidden;
  position: relative;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.profile-photo:hover {
  border-color: var(--color-primary-400);
}

.profile-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.profile-photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.45);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.3rem;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.profile-photo:hover .profile-photo-overlay {
  opacity: 1;
}

.profile-photo-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.4;
}

.profile-photo-input {
  display: none;
}

.profile-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* 이력 키워드 칩 인라인 */
.keyword-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  min-height: 42px;
  background: var(--color-white);
  cursor: text;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.keyword-chip-row:focus-within {
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.keyword-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-200);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-700);
  white-space: nowrap;
}

.keyword-chip-del {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-primary-400);
  font-size: 0.85rem;
  line-height: 1;
  padding: 0 1px;
  display: flex;
  align-items: center;
}

.keyword-chip-del:hover {
  color: var(--color-danger-600);
}

.keyword-chip-input {
  border: none;
  outline: none;
  font-size: var(--font-size-sm);
  font-family: var(--font-family-base);
  color: var(--color-text-primary);
  min-width: 100px;
  flex: 1;
  background: transparent;
}

.keyword-chip-input::placeholder {
  color: var(--color-text-muted);
}

/* ════════════════════════════════
   SECTION 2: 스케줄러 설정
════════════════════════════════ */
.transport-toggle-group {
  display: flex;
  gap: var(--space-3);
}

.transport-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-white);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-family-base);
}

.transport-btn:hover {
  border-color: var(--color-primary-300);
  background: var(--color-primary-50);
}

.transport-btn.selected {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.transport-btn-icon {
  font-size: 1.8rem;
}

.transport-btn-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.transport-btn-sub {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.transport-btn.selected .transport-btn-label {
  color: var(--color-primary-600);
}

/* 버퍼 타임 라디오 버튼 그룹 */
.radio-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.radio-chip {
  display: none;
}

.radio-chip-label {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}

.radio-chip-label:hover {
  border-color: var(--color-primary-300);
  color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.radio-chip:checked + .radio-chip-label {
  border-color: var(--color-primary-500);
  background: var(--color-primary-500);
  color: var(--color-white);
}

/* 직접 입력 연동 */
.buffer-custom-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.buffer-custom-wrap.hidden {
  display: none;
}

.buffer-custom-input {
  width: 80px;
}

.buffer-custom-unit {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 설정 행 */
.scheduler-setting-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) 0;
  border-bottom: 1px solid var(--color-border);
}

.scheduler-setting-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.scheduler-setting-row:first-child {
  padding-top: 0;
}

.scheduler-row-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.scheduler-row-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.scheduler-row-sub {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* ════════════════════════════════
   SECTION 3: 정산 관리
════════════════════════════════ */
.fee-input-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.fee-display {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* Quick-Docs 파일 업로드 */
.quick-docs-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.doc-upload-card {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--color-bg-subtle);
  position: relative;
}

.doc-upload-card:hover {
  border-color: var(--color-primary-300);
  background: var(--color-primary-50);
}

.doc-upload-card.uploaded {
  border-style: solid;
  border-color: var(--color-success-600);
  background: var(--color-success-100);
}

.doc-upload-input {
  display: none;
}

.doc-upload-icon {
  font-size: 2rem;
}

.doc-upload-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  text-align: center;
}

.doc-upload-status {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  text-align: center;
}

.doc-upload-card.uploaded .doc-upload-status {
  color: var(--color-success-600);
  font-weight: var(--font-weight-medium);
}

.doc-upload-del {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-danger-600);
  color: white;
  border: none;
  font-size: 0.75rem;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.doc-upload-card.uploaded .doc-upload-del {
  display: flex;
}

/* ════════════════════════════════
   SECTION 4: 강의 주제 태그
════════════════════════════════ */
.topic-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.topic-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: white;
  position: relative;
  user-select: none;
}

.topic-tag-text {
  /* inherits from parent */
}

.topic-tag-del {
  background: rgba(255,255,255,0.35);
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.75rem;
  color: white;
  line-height: 1;
  padding: 0;
  transition: background var(--transition-fast);
}

.topic-tag-del:hover {
  background: rgba(255,255,255,0.6);
  color: var(--color-danger-600);
}

/* 태그 추가 영역 */
.topic-add-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

.topic-add-input {
  flex: 1;
  height: 36px;
  padding: 0 var(--space-3);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-family: var(--font-family-base);
  background: var(--color-white);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color var(--transition-fast);
}

.topic-add-input:focus {
  border-color: var(--color-primary-500);
}

.color-preset-group {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.color-preset {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2.5px solid transparent;
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast);
  flex-shrink: 0;
}

.color-preset:hover {
  transform: scale(1.15);
}

.color-preset.selected {
  border-color: var(--color-gray-800);
  transform: scale(1.15);
}

.topic-add-btn {
  height: 36px;
  padding: 0 var(--space-4);
  background: var(--color-primary-500);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  font-family: var(--font-family-base);
  transition: background var(--transition-fast);
  white-space: nowrap;
}

.topic-add-btn:hover {
  background: var(--color-primary-600);
}

/* ════════════════════════════════
   SECTION 5: 구독 관리
════════════════════════════════ */
.plan-card {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-5);
  background: linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-800) 100%);
  border-radius: var(--radius-xl);
  color: white;
  margin-bottom: var(--space-5);
}

.plan-card-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.plan-card-info {
  flex: 1;
}

.plan-card-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: -0.02em;
}

.plan-card-badge {
  display: inline-block;
  padding: 2px var(--space-2);
  background: rgba(255,255,255,0.25);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  margin-left: var(--space-2);
  vertical-align: middle;
}

.plan-card-sub {
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
  opacity: 0.8;
}

.plan-card-action {
  display: inline-block;
  padding: var(--space-2) var(--space-4);
  background: white;
  color: var(--color-primary-600);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  border: none;
  font-family: var(--font-family-base);
  transition: opacity var(--transition-fast);
  white-space: nowrap;
}

.plan-card-action:hover {
  opacity: 0.9;
}

.billing-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.billing-info-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

.billing-info-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.billing-info-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.billing-info-action {
  font-size: var(--font-size-xs);
  color: var(--color-primary-500);
  cursor: pointer;
  font-weight: var(--font-weight-medium);
  margin-top: var(--space-1);
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-family-base);
  text-align: left;
}

.billing-info-action:hover {
  text-decoration: underline;
}

/* ════════════════════════════════
   FLOATING SAVE BUTTON
════════════════════════════════ */
.floating-save {
  position: fixed;
  bottom: var(--space-8);
  right: var(--space-8);
  z-index: var(--z-dropdown, 200);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  background: var(--color-primary-500);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-base);
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(37, 99, 196, 0.45);
  transition: background var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
  letter-spacing: -0.01em;
}

.floating-save:hover {
  background: var(--color-primary-600);
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(37, 99, 196, 0.55);
}

.floating-save:active {
  transform: translateY(0);
}

.floating-save-icon {
  font-size: 1.1rem;
}

/* 저장 완료 상태 */
.floating-save.saved {
  background: var(--color-success-600);
  box-shadow: 0 4px 20px rgba(5, 150, 105, 0.4);
}

/* ════════════════════════════════
   TOGGLE SWITCH
════════════════════════════════ */
.mp-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.mp-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mp-toggle-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.mp-toggle-sub {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.mp-toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  flex-shrink: 0;
}

.mp-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.mp-toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--color-gray-300);
  border-radius: var(--radius-full);
  transition: background var(--transition-fast);
  cursor: pointer;
}

.mp-toggle-slider::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.mp-toggle input:checked + .mp-toggle-slider {
  background: var(--color-primary-500);
}

.mp-toggle input:checked + .mp-toggle-slider::before {
  transform: translateX(22px);
}

/* ════════════════════════════════
   RESPONSIVE
════════════════════════════════ */
@media (max-width: 900px) {
  .mypage-layout {
    grid-template-columns: 1fr;
  }

  .mypage-nav {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-2);
  }

  .mypage-nav-item {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-xs);
  }

  .mypage-nav-icon {
    font-size: 0.95rem;
  }

  .mp-form-row--3col {
    grid-template-columns: 1fr 1fr;
  }

  .quick-docs-grid {
    grid-template-columns: 1fr 1fr;
  }

  .billing-info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .mp-form-row {
    grid-template-columns: 1fr;
  }

  .mp-form-row--3col {
    grid-template-columns: 1fr;
  }

  .quick-docs-grid {
    grid-template-columns: 1fr;
  }

  .profile-edit-area {
    flex-direction: column;
    align-items: center;
  }

  .transport-toggle-group {
    flex-direction: column;
  }

  .floating-save {
    right: var(--space-4);
    bottom: var(--space-6);
  }

  .topic-add-row {
    flex-wrap: wrap;
  }
}
