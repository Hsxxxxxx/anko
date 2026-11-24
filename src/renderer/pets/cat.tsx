import type { JSX } from 'react';

/**
 * 小猫：奶油白身子、三角耳、琥珀色虎斑，尾巴会自己甩。
 * 猫崽长出耳朵，小猫额心加一道斑，大猫戴上青项圈，
 * 招财猫挂上铃铛与铜钱，猫大王加一顶小冠。
 */
export function Cat({ stage, size }: { stage: number; size: number }): JSX.Element {
  const level = Math.max(0, Math.min(4, Math.floor(stage)));
  const kitten = level <= 1;
  const tailPath =
    level === 0
      ? 'M66 79 C 75 77 77 68 70 66'
      : level === 1
        ? 'M67 79 C 79 76 81 63 72 60'
        : level === 2
          ? 'M67 79 C 83 75 86 58 74 54'
          : 'M67 79 C 84 76 89 58 77 50';
  return (
    <svg className="pet-figure pet-species-cat" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse className="pet-shadow" cx="50" cy="94" rx="20" ry="3.5" fill="var(--ink)" opacity="0.08" />
      <g className="pet-tail">
        <path d={tailPath} fill="none" stroke="#e8d7b4" strokeWidth="4.6" strokeLinecap="round" />
        {level >= 3 ? <circle cx={level === 4 ? 77 : 74} cy={level === 4 ? 50 : 54} r="3.4" fill="#e8d7b4" /> : null}
      </g>
      <g className="pet-feet">
        <ellipse cx="44" cy="88.5" rx="5.2" ry="3" fill="#f7efdd" stroke="#0a5a54" strokeWidth="1.3" />
        <ellipse cx="56" cy="88.5" rx="5.2" ry="3" fill="#f7efdd" stroke="#0a5a54" strokeWidth="1.3" />
      </g>
      <ellipse className="pet-body" cx="50" cy="72" rx="17" ry="18" fill="#f7efdd" stroke="#0a5a54" strokeWidth="1.5" />
      <ellipse cx="50" cy="76.5" rx="9.5" ry="8" fill="#fdf8ec" />
      {level >= 2 ? (
        <g className="pet-stripes">
          <path d="M60 62 Q64 64 66 68" stroke="#d8b877" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M61 70 Q64 72 65.5 75" stroke="#d8b877" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </g>
      ) : null}
      {level >= 2 ? (
        <g className="pet-cheek-fluff">
          <path d="M34 47 L29 49 L34 52 Z" fill="#f7efdd" stroke="#0a5a54" strokeWidth="1" strokeLinejoin="round" />
          <path d="M66 47 L71 49 L66 52 Z" fill="#f7efdd" stroke="#0a5a54" strokeWidth="1" strokeLinejoin="round" />
        </g>
      ) : null}
      <circle className="pet-head" cx="50" cy="44" r="16" fill="#f7efdd" stroke="#0a5a54" strokeWidth="1.5" />
      <g className="pet-ears">
        <path d={kitten ? 'M37 34 L39.5 16 Q40.5 13.5 42.5 16.5 L50 28 Z' : 'M36 34 L38 12.5 Q39 10 41 12.5 L50 27 Z'} fill="#f7efdd" stroke="#0a5a54" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={kitten ? 'M63 34 L60.5 16 Q59.5 13.5 57.5 16.5 L50 28 Z' : 'M64 34 L62 12.5 Q61 10 59 12.5 L50 27 Z'} fill="#f7efdd" stroke="#0a5a54" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={kitten ? 'M39.5 29 L40.8 20 L45.5 26 Z' : 'M39 29 L40.5 17 L46 25.5 Z'} fill="#fae8e3" />
        <path d={kitten ? 'M60.5 29 L59.2 20 L54.5 26 Z' : 'M61 29 L59.5 17 L54 25.5 Z'} fill="#fae8e3" />
      </g>
      <g className="pet-top pet-forehead">
        {level >= 1 ? <path d="M50 30 V35" stroke="#d8b877" strokeWidth="2.4" fill="none" strokeLinecap="round" /> : null}
        {level >= 2 ? (
          <>
            <path d="M43.5 31.5 L44.5 36" stroke="#d8b877" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M56.5 31.5 L55.5 36" stroke="#d8b877" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </>
        ) : null}
        {level === 4 ? (
          <g className="pet-crown">
            <path d="M42 28 L43.8 18.5 L48.2 23.6 L50 16.5 L51.8 23.6 L56.2 18.5 L58 28 Z" fill="var(--amber)" stroke="#6e4a0e" strokeWidth="1" strokeLinejoin="round" />
            <circle cx="50" cy="24.8" r="1.4" fill="var(--coral)" />
          </g>
        ) : null}
      </g>
      <g className="pet-eyes">
        <circle cx="43" cy="44" r={kitten ? 3.4 : 3.1} fill="var(--ink)" />
        <circle cx="57" cy="44" r={kitten ? 3.4 : 3.1} fill="var(--ink)" />
        <circle cx="44.1" cy="42.9" r="1.05" fill="#ffffff" />
        <circle cx="58.1" cy="42.9" r="1.05" fill="#ffffff" />
      </g>
      <g className="pet-blush">
        <ellipse cx="35" cy="50" rx="3.4" ry="2" fill="rgba(200,71,47,0.35)" />
        <ellipse cx="65" cy="50" rx="3.4" ry="2" fill="rgba(200,71,47,0.35)" />
      </g>
      <path d="M47.8 47.6 L52.2 47.6 L50 50 Z" fill="#c8472f" />
      <path className="pet-mouth" d="M45.6 51 Q48 53.4 50 51.4 Q52 53.4 54.4 51" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
      {level >= 2 ? (
        <g className="pet-whiskers" stroke="#97a6a1" strokeWidth="1" strokeLinecap="round">
          <path d="M30 46 L37 47.5" />
          <path d="M30 51 L37 50" />
          <path d="M70 46 L63 47.5" />
          <path d="M70 51 L63 50" />
        </g>
      ) : null}
      {level >= 2 ? <path d="M42 58.5 Q50 62 58 58.5" fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinecap="round" /> : null}
      {level >= 3 ? (
        <>
          <circle cx="50" cy="61.5" r="2.7" fill="var(--amber)" stroke="#6e4a0e" strokeWidth="0.8" />
          <path d="M50 60.2 V63" stroke="#6e4a0e" strokeWidth="0.9" strokeLinecap="round" />
          <g className="pet-coin" transform="translate(58 60.5) rotate(14)">
            <rect x="-2.8" y="-2.8" width="5.6" height="5.6" rx="1" fill="var(--amber)" stroke="#6e4a0e" strokeWidth="0.8" />
            <rect x="-0.9" y="-0.9" width="1.8" height="1.8" fill="#fdf8ec" />
          </g>
        </>
      ) : null}
    </svg>
  );
}
