import type { JSX } from 'react';
import type { ReminderGlyph } from '../shared/types';

const PATHS: Record<ReminderGlyph, JSX.Element> = {
  water: (
    <>
      <path d="M12 3.2c0 0-6.4 7.1-6.4 11.2a6.4 6.4 0 0 0 12.8 0C18.4 10.3 12 3.2 12 3.2Z" />
      <path d="M9.4 14.6a2.6 2.6 0 0 0 2.6 2.6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="3.1" />
    </>
  ),
  stand: (
    <>
      <path d="M12 20V5.6" />
      <path d="M6.6 11 12 5.6 17.4 11" />
      <path d="M4.5 20h15" />
    </>
  ),
  stretch: (
    <>
      <circle cx="12" cy="5.6" r="2.6" />
      <path d="M5.5 20v-3.4a4.4 4.4 0 0 1 4.4-4.4h4.2a4.4 4.4 0 0 1 4.4 4.4V20" />
      <path d="M12 12.2v-3" />
    </>
  ),
  snack: (
    <>
      <circle cx="12" cy="14" r="5.8" />
      <path d="M12 8.2V6" />
      <path d="M12.2 6.2c1.6-2.2 3.6-2.6 4.4-2.4.2 1-.6 3.2-3 3.6" />
    </>
  ),
  breathe: (
    <>
      <circle cx="8.6" cy="12" r="4.6" />
      <path d="M14.4 8.4a5.4 5.4 0 0 1 0 7.2" />
      <path d="M17.6 5.6a9 9 0 0 1 0 12.8" />
    </>
  ),
  custom: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </>
  ),
};

/** 提醒项图标，统一使用描边风格 */
export function Glyph({ glyph, size = 22 }: { glyph: ReminderGlyph; size?: number }): JSX.Element {
  return (
    <svg
      className="glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[glyph]}
    </svg>
  );
}

/** 小铃铛，进度走到头时轻轻摇一下 */
export function BellIcon({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 9.5a6 6 0 1 0-12 0c0 5.4-2.2 6.6-2.2 6.6h16.4S18 14.9 18 9.5Z" />
      <path d="M10.2 19.4a2 2 0 0 0 3.6 0" />
    </svg>
  );
}
