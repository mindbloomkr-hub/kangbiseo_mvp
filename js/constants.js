// js/constants.js — 전역 상수 (ES Module)
// 매직 넘버·하드코딩 문자열을 한 곳에서 관리한다.

/* ════════════════════════════════════════
   금액
════════════════════════════════════════ */
/** 금액 단위 배수 — 원화 단위 직접 저장, 표시 변환 없음 */
export const REVENUE_UNIT = 1;

/* ════════════════════════════════════════
   강의 진행 상태 (progressStatus)
════════════════════════════════════════ */
export const PROGRESS_DONE      = 'done';
export const PROGRESS_CANCELLED = 'cancelled';
export const PROGRESS_SCHEDULED = 'scheduled';
export const PROGRESS_DISCUSSING  = 'discussing';
export const PROGRESS_ONHOLD      = 'onhold';
export const PROGRESS_NEEDS_REVIEW = 'needs_review';

/* ════════════════════════════════════════
   스케줄러 기본값 (분)
════════════════════════════════════════ */
/** 강의 준비 기본 시간 (분) */
export const DEFAULT_SETUP_MIN  = 20;
/** 강의 마무리 기본 시간 (분) */
export const DEFAULT_WRAPUP_MIN = 15;
/** 이동 버퍼 기본 시간 (분) */
export const DEFAULT_BUFFER_MIN = 30;

/* ════════════════════════════════════════
   충돌 검사 임계값
════════════════════════════════════════ */
/** 이른 출발 경고 기준 — 06:00 이전 출발 시 경고 (분) */
export const EARLY_DEP_MIN    = 360;
/** 늦은 귀가 경고 기준 — 23:00 이후 귀가 시 경고 (분) */
export const RETURN_LIMIT_MIN = 1_380;

/* ════════════════════════════════════════
   이동 시간 추정
════════════════════════════════════════ */
/** 직선거리 기반 이동 시간 추정 속도 (km/h) */
export const FALLBACK_SPEED_KMH = 40;

/* ════════════════════════════════════════
   슬롯 탐색 범위
════════════════════════════════════════ */
/** 빈 슬롯 탐색 시작 시각 */
export const SLOT_DAY_START = '07:00';
/** 빈 슬롯 탐색 종료 시각 */
export const SLOT_DAY_END   = '22:00';
