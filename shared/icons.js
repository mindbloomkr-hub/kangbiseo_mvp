// ============================================================
// shared/icons.js
// 앱 전역에서 사용하는 SVG 아이콘 컴포넌트
// 모두 window.XXXIcon 으로 전역 노출
// ============================================================

window.CheckIcon = function CheckIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke={color} strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
};

window.XIcon = function XIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke={color} strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
};

window.ArrowRightIcon = function ArrowRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
};

window.MenuIcon = function MenuIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
};

window.LogoutIcon = function LogoutIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0
           01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
};

window.CalendarIcon = function CalendarIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path strokeLinecap="round" d="M3 10h18M8 2v3M16 2v3" />
    </svg>
  );
};

window.LocationIcon = function LocationIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75
           7-13c0-3.866-3.134-7-7-7zm0 9a2 2 0 110-4 2 2 0 010 4z" />
    </svg>
  );
};

window.WarningIcon = function WarningIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2
           2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
};

window.CarIcon = function CarIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0
           2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 1h8l2-1zM13 16l2-5h4l2 5H13z" />
    </svg>
  );
};

window.TrainIcon = function TrainIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 2C8 2 6 3 6 7v8l2 3h8l2-3V7c0-4-2-5-6-5z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6 14h12M9 18l-1 2M15 18l1 2M9 7h6" />
    </svg>
  );
};

window.SpinnerIcon = function SpinnerIcon({ size = 20 }) {
  return (
    <svg className="animate-spin" width={size} height={size}
      fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
};

// 🤖 AI 로봇 아이콘
var BotIcon = function BotIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
};

// 📞 전화기 아이콘
var PhoneIcon = function PhoneIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.27-2.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
};