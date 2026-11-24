import type { JSX } from 'react';

/**
 * 小柴犬：奶油黄身子、垂耳卷尾，尾巴摇个不停。
 * 狗崽毛茸茸，小狗长高一点，大狗系上青项圈，
 * 猎犬扎起头巾，犬王再佩一枚铜牌，尾巴翘成双卷。
 */
export function Dog({ stage, size }: { stage: number; size: number }): JSX.Element {
  const level = Math.max(0, Math.min(4, Math.floor(stage)));
  const tailPath =
    level === 0
      ? 'M66 77 C 74 73 76 64 69 62'
      : level === 1
        ? 'M67 78 C 78 73 80 62 71 59'
        : level === 2
          ? 'M67 78 C 81 74 84 60 74 56'
          : level === 3
            ? 'M67 78 C 82 75 86 60 75 55'
            : 'M66 79 C 82 76 88 62 76 54 C 82 55 85 60 82 64';
  const earShape = (side: 1 | -1) => {
    const x = side === 1 ? 35 : 65;
    if (level <= 1) {
      return (
        <>
          <ellipse cx={side === 1 ? 33.5 : 66.5} cy="43" rx="6" ry={level === 0 ? 10.5 : 11.5} fill="#d8b877" stroke="#9c6b16" strokeWidth="1.4" transform={`rotate(${side === 1 ? -16 : 16} ${side === 1 ? 33.5 : 66.5} 43)`} />
          <ellipse cx={side === 1 ? 34 : 66} cy="44" rx="3" ry="6" fill="#c8a35f" transform={`rotate(${side === 1 ? -16 : 16} ${side === 1 ? 34 : 66} 44)`} />
        </>
      );
    }
    if (level <= 3) {
      return (
        <>
          <path d={side === 1 ? 'M35 34 L33.5 19 Q34.5 16 37.5 18.5 L46.5 28 Z' : 'M65 34 L66.5 19 Q65.5 16 62.5 18.5 L53.5 28 Z'} fill="#f2ddb2" stroke="#9c6b16" strokeWidth="1.5" strokeLinejoin="round" />
          <path d={side === 1 ? 'M37 30 L36.5 22.5 L42 27 Z' : 'M63 30 L63.5 22.5 L58 27 Z'} fill="#d8b877" />
        </>
      );
    }
    return (
      <>
        <path d={side === 1 ? 'M34 34 L32.5 15 Q34 12 37 15 L47 26 Z' : 'M66 34 L67.5 15 Q66 12 63 15 L53 26 Z'} fill="#f2ddb2" stroke="#9c6b16" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={side === 1 ? 'M36 29.5 L35.5 21 L41.5 25.5 Z' : 'M64 29.5 L64.5 21 L58.5 25.5 Z'} fill="#d8b877" />
      </>
    );
  };
  return (
    <svg className="pet-figure pet-species-dog" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse className="pet-shadow" cx="50" cy="94" rx="21" ry="3.5" fill="var(--ink)" opacity="0.08" />
      <path className="pet-tail" d={tailPath} fill="none" stroke="#d8b877" strokeWidth="5" strokeLinecap="round" />
      <g className="pet-feet">
        <ellipse cx="44" cy="88.5" rx="5.4" ry="3" fill="#f2ddb2" stroke="#9c6b16" strokeWidth="1.3" />
        <ellipse cx="56" cy="88.5" rx="5.4" ry="3" fill="#f2ddb2" stroke="#9c6b16" strokeWidth="1.3" />
      </g>
      <ellipse className="pet-body" cx="50" cy="72" rx="17.5" ry="18" fill="#f2ddb2" stroke="#9c6b16" strokeWidth="1.5" />
      <ellipse cx="50" cy="77" rx="10" ry="8" fill="#f7efdd" />
      {level >= 2 ? (
        <g className="pet-chest">
          <circle cx="45" cy="63" r="4" fill="#f7efdd" />
          <circle cx="55" cy="63" r="4" fill="#f7efdd" />
          <circle cx="50" cy="65" r="4.2" fill="#f7efdd" />
        </g>
      ) : null}
      <circle className="pet-head" cx="50" cy="44" r="16" fill="#f2ddb2" stroke="#9c6b16" strokeWidth="1.5" />
      {earShape(1)}
      {earShape(-1)}
      <ellipse cx="50" cy="50" rx="9.5" ry="6.5" fill="#f7efdd" />
      <g className="pet-top pet-headband">
        {level >= 3 ? (
          <>
            <path d="M35.5 34 Q50 27.5 64.5 34" fill="none" stroke="var(--teal)" strokeWidth="3.6" strokeLinecap="round" />
            <circle cx="65.5" cy="31.5" r="2.8" fill="var(--teal)" />
            <path d="M67 33 Q71 36 69.5 40" fill="none" stroke="var(--teal)" strokeWidth="2.4" strokeLinecap="round" />
          </>
        ) : null}
      </g>
      <g className="pet-eyes">
        <circle cx="44" cy="42" r={level === 0 ? 3.4 : 3.1} fill="var(--ink)" />
        <circle cx="56" cy="42" r={level === 0 ? 3.4 : 3.1} fill="var(--ink)" />
        <circle cx="45" cy="40.9" r="1.05" fill="#ffffff" />
        <circle cx="57" cy="40.9" r="1.05" fill="#ffffff" />
      </g>
      <g className="pet-blush">
        <ellipse cx="38" cy="49" rx="3.4" ry="2" fill="rgba(200,71,47,0.32)" />
        <ellipse cx="62" cy="49" rx="3.4" ry="2" fill="rgba(200,71,47,0.32)" />
      </g>
      <ellipse cx="50" cy="47.5" rx="3" ry="2.3" fill="var(--ink)" />
      {level === 4 ? (
        <path d="M45.5 51 Q50 55.5 54.5 51 Q50 53 45.5 51 Z" fill="var(--ink)" />
      ) : (
        <path className="pet-mouth" d="M45.8 50.5 Q50 54 54.2 50.5" fill="none" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" />
      )}
      {level >= 2 ? <path d="M42 58.5 Q50 62 58 58.5" fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinecap="round" /> : null}
      {level === 4 ? (
        <g className="pet-medal">
          <path d="M46 60 L50 66 L54 60" fill="none" stroke="var(--coral)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="50" cy="68.5" r="3.4" fill="var(--amber)" stroke="#6e4a0e" strokeWidth="0.9" />
          <circle cx="50" cy="68.5" r="1.4" fill="#fdf8ec" />
        </g>
      ) : null}
    </svg>
  );
}
