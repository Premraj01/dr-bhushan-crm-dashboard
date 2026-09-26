import { useId, type ReactNode } from "react";

export const CONCERN_ILLUSTRATIONS = [
  "norwood-1",
  "norwood-2",
  "norwood-3",
  "norwood-3v",
  "norwood-4",
  "norwood-5",
  "norwood-6",
  "norwood-7",
  "alopecia-areata",
] as const;
export type ConcernIllustration = (typeof CONCERN_ILLUSTRATIONS)[number];

export const ILLUSTRATION_LABELS: Record<ConcernIllustration, string> = {
  "norwood-1": "Norwood · Stage 1",
  "norwood-2": "Norwood · Stage 2",
  "norwood-3": "Norwood · Stage 3",
  "norwood-3v": "Norwood · Stage 3 Vertex",
  "norwood-4": "Norwood · Stage 4",
  "norwood-5": "Norwood · Stage 5",
  "norwood-6": "Norwood · Stage 6",
  "norwood-7": "Norwood · Stage 7",
  "alopecia-areata": "Alopecia areata",
};

/*
 * Head seen from above-front, as in a printed hair-loss chart. Each stage is a
 * hair mask: white = hair, grey = sparse/thinning hair, black = bald scalp.
 * Frontal stages are described by the left half of the hairline (mirrored);
 * crown and rim loss are painted on top.
 */
type Pt = [number, number];

const BALD = "#000";
const SPARSE = "#707070";

/** Smooth curve through points (Catmull-Rom → cubic Bézier). */
function smooth(points: Pt[]): string {
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const [p1, p2] = [points[i]!, points[i + 1]!];
    const p3 = points[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1.join(",")} ${c2.join(",")} ${p2.join(",")}`;
  }
  return d;
}

/** Hair region above a symmetric hairline given by its left half (side → centre). */
function hairAbove(leftHalf: Pt[]): string {
  const right = [...leftHalf]
    .reverse()
    .slice(1)
    .map(([x, y]): Pt => [100 - x, y]);
  const line = [...leftHalf, ...right];
  return `M4,74 L${line[0]!.join(",")}${smooth(line)} L96,74 L96,0 L4,0 Z`;
}

const HAIRLINES = {
  full: [
    [18, 74],
    [19, 62],
    [24, 54],
    [34, 50.5],
    [50, 50],
  ],
  slight: [
    [18, 74],
    [19, 62],
    [23, 55],
    [30, 47.5],
    [37, 49.5],
    [50, 50],
  ],
  deep: [
    [18, 74],
    [19, 62],
    [22, 53],
    [27, 44],
    [33, 40],
    [40, 44],
    [45, 49],
    [50, 50],
  ],
  frontal: [
    [18, 74],
    [19, 62],
    [21, 50],
    [25, 39],
    [31, 32],
    [39, 31],
    [45, 36],
    [50, 38],
  ],
  receded: [
    [18, 74],
    [18.5, 60],
    [20, 46],
    [23, 35],
    [29, 26],
    [38, 23],
    [45, 25],
    [50, 26],
  ],
} satisfies Record<string, Pt[]>;

const crownSpot = (rx: number, ry: number, core: [number, number]) => (
  <>
    <ellipse cx={50} cy={20} rx={rx} ry={ry} fill={SPARSE} />
    <ellipse cx={50} cy={20} rx={core[0]} ry={core[1]} fill={BALD} />
  </>
);

const STAGE_MASKS: Record<ConcernIllustration, ReactNode> = {
  "norwood-1": <path d={hairAbove(HAIRLINES.full)} fill="#fff" />,
  "norwood-2": <path d={hairAbove(HAIRLINES.slight)} fill="#fff" />,
  "norwood-3": <path d={hairAbove(HAIRLINES.deep)} fill="#fff" />,
  "norwood-3v": (
    <>
      <path d={hairAbove(HAIRLINES.deep)} fill="#fff" />
      {crownSpot(7, 5, [3.5, 2.5])}
    </>
  ),
  "norwood-4": (
    <>
      <path d={hairAbove(HAIRLINES.frontal)} fill="#fff" />
      {crownSpot(11, 7, [7, 4.2])}
      {/* sparse bridge of hair separating the frontal loss from the crown */}
      <path d="M22,31 Q50,24 78,31" stroke={SPARSE} strokeWidth={4.5} fill="none" />
    </>
  ),
  "norwood-5": (
    <>
      <path d={hairAbove(HAIRLINES.receded)} fill="#fff" />
      <ellipse cx={50} cy={13} rx={19} ry={9} fill={BALD} />
      {/* bridge narrowed to a thin, sparse band */}
      <path d="M20,26 Q50,19 80,26" stroke={SPARSE} strokeWidth={2.6} fill="none" />
    </>
  ),
  "norwood-6": (
    <>
      <path d={hairAbove(HAIRLINES.full)} fill="#fff" />
      <ellipse cx={50} cy={33} rx={25.5} ry={30} fill={BALD} />
    </>
  ),
  "norwood-7": (
    <>
      <path d={hairAbove(HAIRLINES.full)} fill="#fff" />
      <ellipse cx={50} cy={36} rx={27.5} ry={33} fill={BALD} />
    </>
  ),
  "alopecia-areata": (
    <>
      <path d={hairAbove(HAIRLINES.full)} fill="#fff" />
      <circle cx={38} cy={30} r={6} fill={BALD} />
      <circle cx={62} cy={36} r={4.5} fill={BALD} />
      <circle cx={54} cy={19} r={3.5} fill={BALD} />
    </>
  ),
};

export function HairLossIllustration({
  kind,
  className,
  title,
}: {
  kind: ConcernIllustration;
  className?: string;
  title?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title ?? ILLUSTRATION_LABELS[kind]}
    >
      <defs>
        {/* Hair sits slightly outside the skull outline. */}
        <clipPath id={`${id}-hair-clip`}>
          <ellipse cx={50} cy={47} rx={32.5} ry={38.5} />
        </clipPath>
        <mask
          id={`${id}-hair-mask`}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={100}
          height={100}
        >
          {STAGE_MASKS[kind]}
        </mask>
      </defs>

      {/* Ears, head and face */}
      <ellipse cx={19.5} cy={66} rx={3.4} ry={6.5} className="hl-skin" />
      <ellipse cx={80.5} cy={66} rx={3.4} ry={6.5} className="hl-skin" />
      <ellipse cx={50} cy={47} rx={31} ry={37} className="hl-skin" />
      <g className="hl-feature">
        <path d="M36,64 q5,-1.8 10,0 M54,64 q5,-1.8 10,0" />
        <path d="M38,69.5 q3.5,1.8 7,0 M55,69.5 q3.5,1.8 7,0" />
        <path d="M50,68.5 l-1.8,7 h3.4" />
        <path d="M45,80 q5,2.2 10,0" />
      </g>

      {/* Hair */}
      <g clipPath={`url(#${id}-hair-clip)`}>
        <rect
          x={0}
          y={0}
          width={100}
          height={100}
          className="hl-hair"
          mask={`url(#${id}-hair-mask)`}
        />
      </g>
    </svg>
  );
}
