import type { JSX } from 'react';

/**
 * 小苗：安叩的默认桌面宠物，一株会眨眼睛的苗。
 * 五个成长阶段（种子、发芽、幼苗、小树、大树）随完成提醒的次数推进，
 * 桌面窗口与主窗口的完成统计共用这个形象。
 */
export function Sprout({ stage, size }: { stage: number; size: number }): JSX.Element {
  const level = Math.max(0, Math.min(4, Math.floor(stage)));
  const seed = level === 0;
  const bodyRx = 15 + level * 1.5;
  const bodyRy = 15 + level * 1.2;
  return (
    <svg
      className="pet-figure pet-species-sprout"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <ellipse className="pet-shadow" cx="50" cy="94" rx={20 + level} ry="3.5" fill="var(--ink)" opacity="0.08" />
      {seed ? (
        <>
          <ellipse cx="50" cy="78" rx="17" ry="15" fill="var(--amber)" />
          <path d="M40 72 Q50 78 60 72" stroke="#6e4a0e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <g className="pet-eyes">
            <path d="M42 84 Q45 87 48 84" stroke="var(--ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M52 84 Q55 87 58 84" stroke="var(--ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </g>
          <g className="pet-blush">
            <ellipse cx="40" cy="88" rx="3" ry="1.8" fill="var(--coral)" opacity="0.35" />
            <ellipse cx="60" cy="88" rx="3" ry="1.8" fill="var(--coral)" opacity="0.35" />
          </g>
          <circle cx="50" cy="63" r="2.6" fill="var(--teal)" />
        </>
      ) : (
        <>
          <g className="pet-feet">
            <ellipse cx="42" cy="89" rx="6" ry="3.2" fill="var(--amber)" stroke="#6e4a0e" strokeWidth="1.2" />
            <ellipse cx="58" cy="89" rx="6" ry="3.2" fill="var(--amber)" stroke="#6e4a0e" strokeWidth="1.2" />
          </g>
          <ellipse className="pet-body" cx="50" cy="73" rx={bodyRx} ry={bodyRy} fill="var(--amber)" stroke="#6e4a0e" strokeWidth="1.4" />
          <ellipse cx="50" cy="77" rx={bodyRx - 7} ry={bodyRy - 9} fill="#f2ddb2" opacity="0.55" />
          {level >= 3 ? (
            <path d="M38 84 Q43 86 47 84" stroke="#6e4a0e" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5" />
          ) : null}
          <g className="pet-eyes">
            <circle cx="43" cy="70" r="3.1" fill="var(--ink)" />
            <circle cx="57" cy="70" r="3.1" fill="var(--ink)" />
            <circle cx="44" cy="69" r="1" fill="#ffffff" />
            <circle cx="58" cy="69" r="1" fill="#ffffff" />
          </g>
          <g className="pet-blush">
            <ellipse cx="36" cy="76" rx="3.4" ry="2" fill="var(--coral)" opacity="0.4" />
            <ellipse cx="64" cy="76" rx="3.4" ry="2" fill="var(--coral)" opacity="0.4" />
          </g>
          <path className="pet-mouth" d="M46.5 75 Q50 78.4 53.5 75" stroke="var(--ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <g className="pet-top">
            {level === 1 ? (
              <>
                <path d="M50 58 V46" stroke="var(--teal-deep)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                <ellipse cx="44.5" cy="44" rx="6.2" ry="3" fill="var(--teal)" transform="rotate(-24 44.5 44)" />
                <ellipse cx="55.5" cy="44" rx="6.2" ry="3" fill="var(--teal)" transform="rotate(24 55.5 44)" />
              </>
            ) : null}
            {level === 2 ? (
              <>
                <path d="M50 58 V40" stroke="var(--teal-deep)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                <ellipse cx="42.5" cy="50" rx="6.4" ry="3.2" fill="var(--teal)" transform="rotate(-28 42.5 50)" />
                <ellipse cx="57.5" cy="50" rx="6.4" ry="3.2" fill="var(--teal)" transform="rotate(28 57.5 50)" />
                <ellipse cx="44.5" cy="38" rx="6.6" ry="3.4" fill="var(--teal)" transform="rotate(-22 44.5 38)" />
                <ellipse cx="55.5" cy="38" rx="6.6" ry="3.4" fill="var(--teal)" transform="rotate(22 55.5 38)" />
                <circle cx="50" cy="35.5" r="2.6" fill="var(--teal-deep)" />
              </>
            ) : null}
            {level === 3 ? (
              <>
                <path d="M50 58 V44" stroke="#8a5a1a" strokeWidth="3.4" fill="none" strokeLinecap="round" />
                <g className="pet-crown">
                  <circle cx="39" cy="36" r="8.4" fill="var(--teal-deep)" />
                  <circle cx="61" cy="36" r="8.4" fill="var(--teal-deep)" />
                  <circle cx="50" cy="29" r="10" fill="var(--teal)" />
                  <circle cx="44" cy="34" r="1.5" fill="#d8f3ef" opacity="0.8" />
                  <circle cx="56" cy="31" r="1.5" fill="#d8f3ef" opacity="0.8" />
                </g>
                <circle cx="41" cy="41" r="2.4" fill="var(--coral)" />
              </>
            ) : null}
            {level === 4 ? (
              <>
                <path d="M50 58 V40" stroke="#8a5a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
                <g className="pet-crown">
                  <ellipse cx="38" cy="33" rx="10" ry="9" fill="var(--teal)" />
                  <ellipse cx="62" cy="33" rx="10" ry="9" fill="var(--teal)" />
                  <ellipse cx="50" cy="25" rx="12" ry="10.5" fill="var(--teal)" />
                  <ellipse cx="34" cy="40" rx="6.5" ry="5.5" fill="var(--teal-deep)" />
                  <ellipse cx="66" cy="40" rx="6.5" ry="5.5" fill="var(--teal-deep)" />
                  <circle cx="43" cy="28" r="1.7" fill="#d8f3ef" opacity="0.85" />
                  <circle cx="56" cy="23" r="1.7" fill="#d8f3ef" opacity="0.85" />
                  <circle cx="61" cy="35" r="1.7" fill="#d8f3ef" opacity="0.85" />
                </g>
                <circle cx="39" cy="39" r="2.7" fill="var(--coral)" />
                <circle cx="62" cy="38" r="2.7" fill="var(--coral)" />
                <circle cx="50" cy="35" r="2.7" fill="var(--coral-tint)" />
              </>
            ) : null}
          </g>
        </>
      )}
    </svg>
  );
}
