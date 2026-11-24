import type { JSX } from 'react';

/**
 * 小兔：雪白身子、长耳朵、绒绒尾巴，耳朵会一颠一颠。
 * 兔崽耳朵短短的，小兔渐渐长开，大兔有了小鼻子，
 * 垂耳兔耷拉一只耳朵别上一朵小花，玉兔头顶浮起一轮光晕。
 */
export function Rabbit({ stage, size }: { stage: number; size: number }): JSX.Element {
  const level = Math.max(0, Math.min(4, Math.floor(stage)));
  const earRy = [9, 12, 15, 15, 16][level] ?? 15;
  const flopped = level === 3;
  const ear = (side: 1 | -1) => {
    const cx = side === 1 ? 42 : 58;
    const rotate = side === 1 ? -8 : 8;
    return (
      <>
        <ellipse cx={cx} cy={33 - earRy + 2} rx="5.2" ry={earRy} fill="#f7f9f8" stroke="#7d908a" strokeWidth="1.5" transform={`rotate(${rotate} ${cx} 33)`} />
        <ellipse cx={cx} cy={33 - earRy + 4.5} rx="2.4" ry={Math.max(2, earRy - 7)} fill="#fae8e3" transform={`rotate(${rotate} ${cx} 33)`} />
      </>
    );
  };
  return (
    <svg className="pet-figure pet-species-rabbit" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse className="pet-shadow" cx="50" cy="94" rx="19" ry="3.5" fill="var(--ink)" opacity="0.08" />
      <circle className="pet-tail" cx="66" cy="71" r="5.6" fill="#f7f9f8" stroke="#7d908a" strokeWidth="1.4" />
      <g className="pet-feet">
        <ellipse cx="43" cy="88.5" rx="5.6" ry="3" fill="#f7f9f8" stroke="#7d908a" strokeWidth="1.4" />
        <ellipse cx="57" cy="88.5" rx="5.6" ry="3" fill="#f7f9f8" stroke="#7d908a" strokeWidth="1.4" />
      </g>
      <ellipse className="pet-body" cx="50" cy="73" rx="17" ry="16" fill="#f7f9f8" stroke="#7d908a" strokeWidth="1.5" />
      <g className="pet-ears">
        <g className="pet-ear pet-ear-left">{ear(1)}</g>
        <g transform={flopped ? 'rotate(102 58 31)' : undefined}>
          <g className="pet-ear pet-ear-right">{ear(-1)}</g>
        </g>
      </g>
      <circle className="pet-head" cx="50" cy="47" r="15" fill="#f7f9f8" stroke="#7d908a" strokeWidth="1.5" />
      <g className="pet-top pet-halo">
        {level === 4 ? <path d="M37 21 Q50 14.5 63 21" fill="none" stroke="var(--amber)" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" /> : null}
      </g>
      {level >= 3 ? (
        <g className="pet-flower" transform="translate(37.5 27)">
          <circle cx="0" cy="-2.6" r="2.1" fill="var(--coral)" />
          <circle cx="2.5" cy="0" r="2.1" fill="var(--coral)" />
          <circle cx="0" cy="2.6" r="2.1" fill="var(--coral)" />
          <circle cx="-2.5" cy="0" r="2.1" fill="var(--coral)" />
          <circle cx="0" cy="0" r="1.5" fill="var(--amber)" />
        </g>
      ) : null}
      <g className="pet-eyes">
        <circle cx="44" cy="46" r={level <= 1 ? 3.2 : 3} fill="var(--ink)" />
        <circle cx="56" cy="46" r={level <= 1 ? 3.2 : 3} fill="var(--ink)" />
        <circle cx="45" cy="45" r="1" fill="#ffffff" />
        <circle cx="57" cy="45" r="1" fill="#ffffff" />
      </g>
      <g className="pet-blush">
        <ellipse cx="38" cy="52" rx="3.4" ry="2" fill="rgba(200,71,47,0.32)" />
        <ellipse cx="62" cy="52" rx="3.4" ry="2" fill="rgba(200,71,47,0.32)" />
      </g>
      {level >= 2 ? <path d="M48.6 49.6 L51.4 49.6 L50 51.6 Z" fill="var(--coral)" /> : null}
      <path className="pet-mouth" d="M46.6 52.8 Q48.3 55 50 53 Q51.7 55 53.4 52.8" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
