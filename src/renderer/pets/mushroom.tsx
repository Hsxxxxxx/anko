import type { JSX } from 'react';

/**
 * 小蘑菇：珊瑚红伞盖配米白斑点，伞盖会轻轻摇摆。
 * 孢子是一粒米白的小圆球，菌芽冒出小伞，小蘑菇撑开三颗斑，
 * 伞菌的伞盖更宽还长出一圈菌环，巨型蘑菇脚边再冒出个小蘑菇。
 */
export function Mushroom({ stage, size }: { stage: number; size: number }): JSX.Element {
  const level = Math.max(0, Math.min(4, Math.floor(stage)));
  return (
    <svg className="pet-figure pet-species-mushroom" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse className="pet-shadow" cx="50" cy="94" rx={level === 4 ? 24 : 19} ry="3.5" fill="var(--ink)" opacity="0.08" />
      {level === 0 ? (
        <>
          <circle className="pet-body" cx="50" cy="74" r="14" fill="#f2f5f4" stroke="#97a6a1" strokeWidth="1.4" />
          <g className="pet-cap">
            <path d="M41 66 Q50 53 59 66 Q50 71 41 66 Z" fill="var(--teal)" />
            <circle cx="47" cy="61" r="1.6" fill="#d8f3ef" />
          </g>
          <g className="pet-eyes">
            <circle cx="45" cy="73" r="2.9" fill="var(--ink)" />
            <circle cx="55" cy="73" r="2.9" fill="var(--ink)" />
            <circle cx="45.9" cy="72" r="0.9" fill="#ffffff" />
            <circle cx="55.9" cy="72" r="0.9" fill="#ffffff" />
          </g>
          <g className="pet-blush">
            <ellipse cx="39.5" cy="78" rx="2.8" ry="1.7" fill="rgba(200,71,47,0.32)" />
            <ellipse cx="60.5" cy="78" rx="2.8" ry="1.7" fill="rgba(200,71,47,0.32)" />
          </g>
          <path className="pet-mouth" d="M47 78 Q50 81 53 78" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path
            className="pet-body"
            d={
              level === 1
                ? 'M44 54 L44 82 Q44 87 50 87 Q56 87 56 82 L56 54 Z'
                : level <= 3
                  ? 'M42 52 L42 83 Q42 88 50 88 Q58 88 58 83 L58 52 Z'
                  : 'M40 52 L40 83 Q40 88 50 88 Q60 88 60 83 L60 52 Z'
            }
            fill="#f2f5f4"
            stroke="#97a6a1"
            strokeWidth="1.4"
          />
          {level >= 3 ? (
            <path d={level === 3 ? 'M41.5 60 Q50 64 58.5 60' : 'M39.5 60 Q50 64.5 60.5 60'} fill="none" stroke="#dfe6e4" strokeWidth="3.4" strokeLinecap="round" />
          ) : null}
          <g className="pet-cap">
            <path
              d={
                level === 1
                  ? 'M34 55 C 34 39 42 31 50 31 C 58 31 66 39 66 55 Q50 60 34 55 Z'
                  : level === 2
                    ? 'M26 53 C 26 31 38 19 50 19 C 62 19 74 31 74 53 Q50 60 26 53 Z'
                    : level === 3
                      ? 'M22 52 C 22 32 36 21 50 21 C 64 21 78 32 78 52 Q50 59 22 52 Z'
                      : 'M20 52 C 20 26 34 14 50 14 C 66 14 80 26 80 52 Q50 61 20 52 Z'
              }
              fill="var(--coral)"
            />
            <path
              d={
                level === 1
                  ? 'M36 54 Q50 59 64 54'
                  : level === 2
                    ? 'M29 52 Q50 59 71 52'
                    : level === 3
                      ? 'M25 51 Q50 58 75 51'
                      : 'M23 51 Q50 59.5 77 51'
              }
              fill="none"
              stroke="#a03a24"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.6"
            />
            {level === 1 ? (
              <>
                <circle cx="44" cy="42" r="2.8" fill="#f7efdd" />
                <circle cx="57" cy="40" r="2.3" fill="#f7efdd" />
              </>
            ) : null}
            {level === 2 ? (
              <>
                <circle cx="39" cy="36" r="4" fill="#f7efdd" />
                <circle cx="58" cy="31" r="3.2" fill="#f7efdd" />
                <circle cx="50" cy="46" r="3" fill="#f7efdd" />
              </>
            ) : null}
            {level === 3 ? (
              <>
                <circle cx="35" cy="37" r="3.8" fill="#f7efdd" />
                <circle cx="58" cy="30" r="3.4" fill="#f7efdd" />
                <circle cx="47" cy="44" r="3" fill="#f7efdd" />
                <circle cx="66" cy="41" r="2.8" fill="#f7efdd" />
                <circle cx="30" cy="44" r="2.4" fill="#f7efdd" />
              </>
            ) : null}
            {level === 4 ? (
              <>
                <circle cx="36" cy="34" r="4.4" fill="#f7efdd" />
                <circle cx="60" cy="28" r="3.8" fill="#f7efdd" />
                <circle cx="48" cy="44" r="3.4" fill="#f7efdd" />
                <circle cx="68" cy="41" r="3" fill="#f7efdd" />
                <circle cx="30" cy="43" r="2.8" fill="#f7efdd" />
                <circle cx="52" cy="23" r="2.6" fill="#f7efdd" />
              </>
            ) : null}
          </g>
          {level === 4 ? (
            <g className="pet-baby">
              <path d="M31 78 L31 85 Q31 88 34.5 88 Q38 88 38 85 L38 78 Z" fill="#f2f5f4" stroke="#97a6a1" strokeWidth="1.1" />
              <path d="M27.5 78 Q34.5 70.5 41.5 78 Q34.5 82 27.5 78 Z" fill="var(--coral)" />
              <circle cx="34.5" cy="74.5" r="1.5" fill="#f7efdd" />
            </g>
          ) : null}
          {level === 4 ? (
            <g className="pet-leaf">
              <ellipse cx="68" cy="81" rx="8" ry="3.4" fill="var(--teal)" transform="rotate(-18 68 81)" />
              <path d="M62.5 83 Q68 81 73.5 78.5" stroke="var(--teal-deep)" strokeWidth="0.9" fill="none" strokeLinecap="round" />
            </g>
          ) : null}
          <g className="pet-eyes">
            <circle cx="45" cy="66" r="3" fill="var(--ink)" />
            <circle cx="55" cy="66" r="3" fill="var(--ink)" />
            <circle cx="45.9" cy="65" r="1" fill="#ffffff" />
            <circle cx="55.9" cy="65" r="1" fill="#ffffff" />
          </g>
          <g className="pet-blush">
            <ellipse cx="39" cy="71.5" rx="3" ry="1.8" fill="rgba(200,71,47,0.32)" />
            <ellipse cx="61" cy="71.5" rx="3" ry="1.8" fill="rgba(200,71,47,0.32)" />
          </g>
          <path className="pet-mouth" d="M46.6 71.5 Q50 74.8 53.4 71.5" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
