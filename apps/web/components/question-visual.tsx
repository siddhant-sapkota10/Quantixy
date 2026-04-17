"use client";

import type { DiagramSpec } from "@/lib/question-model";

type QuestionVisualProps = {
  spec: DiagramSpec | null | undefined;
};

function CoordinateGrid({
  xRange = [-6, 6],
  yRange = [-6, 6],
  points = [],
  showLine = false,
}: {
  xRange?: [number, number];
  yRange?: [number, number];
  points?: Array<{ x: number; y: number; label?: string; color?: string }>;
  showLine?: boolean;
}) {
  const width = 320;
  const height = 220;
  const pad = 24;
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;

  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (width - pad * 2);
  const sy = (y: number) => height - pad - ((y - yMin) / (yMax - yMin)) * (height - pad * 2);

  const xTicks = [];
  for (let x = xMin; x <= xMax; x += 1) xTicks.push(x);
  const yTicks = [];
  for (let y = yMin; y <= yMax; y += 1) yTicks.push(y);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[14rem] w-full text-slate-200">
      <rect x="0" y="0" width={width} height={height} rx="16" fill="rgba(15,23,42,0.72)" />
      {xTicks.map((x) => (
        <line key={`x-${x}`} x1={sx(x)} y1={pad} x2={sx(x)} y2={height - pad} stroke="rgba(148,163,184,0.16)" />
      ))}
      {yTicks.map((y) => (
        <line key={`y-${y}`} x1={pad} y1={sy(y)} x2={width - pad} y2={sy(y)} stroke="rgba(148,163,184,0.16)" />
      ))}
      <line x1={sx(0)} y1={pad} x2={sx(0)} y2={height - pad} stroke="rgba(148,163,184,0.6)" />
      <line x1={pad} y1={sy(0)} x2={width - pad} y2={sy(0)} stroke="rgba(148,163,184,0.6)" />

      {showLine && points.length >= 2 ? (
        <line x1={sx(points[0].x)} y1={sy(points[0].y)} x2={sx(points[1].x)} y2={sy(points[1].y)} stroke="rgba(56,189,248,0.7)" strokeWidth="2.6" />
      ) : null}

      {points.map((p, idx) => (
        <g key={`${p.x}-${p.y}-${idx}`}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r="5.5" fill={p.color ?? "rgba(56,189,248,0.95)"} />
          <text x={sx(p.x) + 8} y={sy(p.y) - 8} fill="rgba(226,232,240,0.95)" fontSize="12" fontWeight="700">
            {p.label ?? ""}
          </text>
        </g>
      ))}
    </svg>
  );
}

function fractionToDecimal(n: number, d: number) {
  if (!d) return 0;
  return n / d;
}

export function QuestionVisual({ spec }: QuestionVisualProps) {
  if (!spec) return null;

  if (spec.kind === "rectangle") {
    return (
      <svg viewBox="0 0 320 220" className="h-[13.5rem] w-full text-slate-100">
        <rect x="24" y="36" width="272" height="148" rx="16" fill="rgba(15,23,42,0.72)" stroke="rgba(148,163,184,0.45)" strokeWidth="2" />
        <text x="160" y="30" textAnchor="middle" fill="rgba(226,232,240,0.92)" fontSize="13" fontWeight="700">
          w = {spec.labels?.width ?? spec.width}
        </text>
        <text x="12" y="112" fill="rgba(226,232,240,0.92)" fontSize="13" fontWeight="700">
          h = {spec.labels?.height ?? spec.height}
        </text>
      </svg>
    );
  }

  if (spec.kind === "triangle-angle") {
    return (
      <svg viewBox="0 0 320 220" className="h-[13.5rem] w-full text-slate-100">
        <polygon points="60,176 258,176 165,44" fill="rgba(15,23,42,0.76)" stroke="rgba(148,163,184,0.65)" strokeWidth="2.2" />
        <text x="86" y="164" fill="rgba(125,211,252,0.95)" fontSize="13" fontWeight="700">{spec.values.a}°</text>
        <text x="226" y="164" fill="rgba(251,146,60,0.95)" fontSize="13" fontWeight="700">{spec.values.b}°</text>
        <text x="158" y="64" fill="rgba(192,132,252,0.98)" fontSize="14" fontWeight="800">{spec.values.c}°</text>
      </svg>
    );
  }

  if (spec.kind === "circle") {
    return (
      <svg viewBox="0 0 320 220" className="h-[13.5rem] w-full text-slate-100">
        <circle cx="160" cy="112" r="72" fill="rgba(15,23,42,0.76)" stroke="rgba(148,163,184,0.62)" strokeWidth="2.2" />
        {spec.showDiameter ? <line x1="88" y1="112" x2="232" y2="112" stroke="rgba(56,189,248,0.8)" strokeWidth="2.4" /> : null}
        <text x="160" y="110" textAnchor="middle" fill="rgba(226,232,240,0.95)" fontSize="14" fontWeight="700">
          {spec.label ?? ""}
        </text>
      </svg>
    );
  }

  if (spec.kind === "line-angle") {
    return (
      <svg viewBox="0 0 320 220" className="h-[13.5rem] w-full text-slate-100">
        <line x1="40" y1="160" x2="280" y2="160" stroke="rgba(148,163,184,0.8)" strokeWidth="2.4" />
        <line x1="160" y1="160" x2="100" y2="84" stroke="rgba(56,189,248,0.85)" strokeWidth="2.4" />
        <path d="M140 158 A28 28 0 0 1 122 134" stroke="rgba(56,189,248,0.9)" fill="none" strokeWidth="2.2" />
        <path d="M180 158 A40 40 0 0 0 105 126" stroke="rgba(251,113,133,0.9)" fill="none" strokeWidth="2.2" />
        <text x="112" y="128" fill="rgba(125,211,252,0.96)" fontSize="14" fontWeight="700">{spec.known}°</text>
        <text x="205" y="132" fill="rgba(251,113,133,0.96)" fontSize="14" fontWeight="700">{spec.unknownLabel ?? "?"}</text>
      </svg>
    );
  }

  if (spec.kind === "fraction-bars") {
    const { denominator, numerators, operation } = spec;
    const barWidth = 120;
    const segment = barWidth / denominator;
    return (
      <svg viewBox="0 0 320 120" className="h-[8.25rem] w-full text-slate-100">
        {[0, 1].map((row) => (
          <g key={row} transform={`translate(${28 + row * 168},20)`}>
            <rect x="0" y="0" width={barWidth} height="34" rx="8" fill="rgba(15,23,42,0.62)" stroke="rgba(148,163,184,0.55)" />
            {Array.from({ length: denominator }).map((_, i) => (
              <g key={i}>
                <rect
                  x={i * segment}
                  y="0"
                  width={segment}
                  height="34"
                  fill={i < numerators[row] ? "rgba(56,189,248,0.78)" : "transparent"}
                  stroke="rgba(148,163,184,0.35)"
                />
              </g>
            ))}
            <text x={barWidth / 2} y="56" textAnchor="middle" fill="rgba(226,232,240,0.95)" fontSize="13" fontWeight="700">
              {numerators[row]}/{denominator}
            </text>
          </g>
        ))}
        <text x="160" y="40" textAnchor="middle" fill="rgba(226,232,240,0.95)" fontSize="16" fontWeight="800">
          {operation ?? "+"}
        </text>
      </svg>
    );
  }

  if (spec.kind === "fraction-of-number") {
    const width = 280;
    const segment = width / spec.denominator;
    return (
      <svg viewBox="0 0 320 120" className="h-[8.25rem] w-full text-slate-100">
        <g transform="translate(20,22)">
          <rect x="0" y="0" width={width} height="36" rx="8" fill="rgba(15,23,42,0.62)" stroke="rgba(148,163,184,0.55)" />
          {Array.from({ length: spec.denominator }).map((_, i) => (
            <rect
              key={i}
              x={i * segment}
              y="0"
              width={segment}
              height="36"
              fill={i < spec.numerator ? "rgba(56,189,248,0.78)" : "transparent"}
              stroke="rgba(148,163,184,0.35)"
            />
          ))}
          <text x={width / 2} y="62" textAnchor="middle" fill="rgba(226,232,240,0.95)" fontSize="13" fontWeight="700">
            {spec.numerator}/{spec.denominator} of {spec.whole}
          </text>
        </g>
      </svg>
    );
  }

  if (spec.kind === "fraction-compare-line") {
    const left = fractionToDecimal(spec.left.n, spec.left.d);
    const right = fractionToDecimal(spec.right.n, spec.right.d);
    const sx = (v: number) => 26 + v * 268;
    return (
      <svg viewBox="0 0 320 110" className="h-[7.25rem] w-full text-slate-100">
        <line x1="26" y1="62" x2="294" y2="62" stroke="rgba(148,163,184,0.75)" strokeWidth="2.2" />
        <line x1="26" y1="56" x2="26" y2="68" stroke="rgba(148,163,184,0.9)" />
        <line x1="294" y1="56" x2="294" y2="68" stroke="rgba(148,163,184,0.9)" />
        <circle cx={sx(left)} cy="62" r="5.8" fill="rgba(56,189,248,0.95)" />
        <circle cx={sx(right)} cy="62" r="5.8" fill="rgba(251,113,133,0.95)" />
        <text x={sx(left)} y="40" textAnchor="middle" fill="rgba(125,211,252,0.96)" fontSize="12" fontWeight="700">
          {spec.left.n}/{spec.left.d}
        </text>
        <text x={sx(right)} y="88" textAnchor="middle" fill="rgba(251,146,60,0.96)" fontSize="12" fontWeight="700">
          {spec.right.n}/{spec.right.d}
        </text>
      </svg>
    );
  }

  if (spec.kind === "ratio-dots") {
    const dots = [
      ...Array.from({ length: spec.red }).map((_, i) => ({ color: "rgba(251,113,133,0.95)", i })),
      ...Array.from({ length: spec.blue }).map((_, i) => ({ color: "rgba(56,189,248,0.95)", i: i + spec.red })),
    ];
    return (
      <svg viewBox="0 0 320 120" className="h-[8.25rem] w-full text-slate-100">
        {dots.map((dot) => {
          const col = dot.i % 10;
          const row = Math.floor(dot.i / 10);
          return <circle key={dot.i} cx={26 + col * 28} cy={26 + row * 24} r="8" fill={dot.color} />;
        })}
      </svg>
    );
  }

  if (spec.kind === "sequence-boxes") {
    return (
      <svg viewBox="0 0 320 86" className="h-[6.25rem] w-full text-slate-100">
        {spec.values.map((v, i) => (
          <g key={`${v}-${i}`} transform={`translate(${16 + i * 74},16)`}>
            <rect x="0" y="0" width="60" height="46" rx="10" fill="rgba(15,23,42,0.72)" stroke="rgba(148,163,184,0.5)" />
            <text x="30" y="29" textAnchor="middle" fill="rgba(226,232,240,0.95)" fontSize="14" fontWeight="800">
              {v}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  if (spec.kind === "probability-line") {
    const x = 28 + (spec.favorable / spec.total) * 262;
    return (
      <svg viewBox="0 0 320 100" className="h-[7rem] w-full text-slate-100">
        <line x1="28" y1="56" x2="290" y2="56" stroke="rgba(148,163,184,0.75)" strokeWidth="2.2" />
        <circle cx={x} cy="56" r="6" fill="rgba(56,189,248,0.95)" />
        <text x={x} y="36" textAnchor="middle" fill="rgba(56,189,248,0.95)" fontSize="13" fontWeight="800">
          {spec.favorable}/{spec.total}
        </text>
      </svg>
    );
  }

  if (spec.kind === "right-triangle") {
    const { opp, adj, hyp } = spec.sides;
    const ax = 72;
    const ay = 178;
    const bx = 264;
    const by = 178;
    const cx = 72;
    const cy = 70;
    return (
      <svg viewBox="0 0 320 220" className="h-[13.5rem] w-full text-slate-100">
        <polygon
          points={`${ax},${ay} ${bx},${by} ${cx},${cy}`}
          fill="rgba(15,23,42,0.76)"
          stroke="rgba(148,163,184,0.62)"
          strokeWidth="2.2"
        />
        <rect x={ax} y={ay - 16} width="16" height="16" fill="none" stroke="rgba(148,163,184,0.82)" strokeWidth="1.8" />

        {/* Theta arc + symbol at the reference angle */}
        <path d="M236 178 A28 28 0 0 0 247 162" fill="none" stroke="rgba(125,211,252,0.95)" strokeWidth="2.2" />
        <text x="231" y="164" fill="rgba(125,211,252,0.98)" fontSize="15" fontWeight="800">
          θ
        </text>

        {/* Opposite label chip */}
        <g transform="translate(12,108)">
          <rect x="0" y="-14" width="70" height="24" rx="8" fill="rgba(2,6,23,0.88)" stroke="rgba(148,163,184,0.55)" />
          <text x="35" y="2" textAnchor="middle" fill="rgba(226,232,240,0.98)" fontSize="12" fontWeight="800">
            opp = {opp}
          </text>
        </g>

        {/* Adjacent label chip */}
        <g transform="translate(126,202)">
          <rect x="0" y="-14" width="74" height="24" rx="8" fill="rgba(2,6,23,0.88)" stroke="rgba(148,163,184,0.55)" />
          <text x="37" y="2" textAnchor="middle" fill="rgba(226,232,240,0.98)" fontSize="12" fontWeight="800">
            adj = {adj}
          </text>
        </g>

        {/* Hypotenuse label chip */}
        <g transform="translate(176,94)">
          <rect x="0" y="-14" width="74" height="24" rx="8" fill="rgba(2,6,23,0.9)" stroke="rgba(148,163,184,0.55)" />
          <text x="37" y="2" textAnchor="middle" fill="rgba(226,232,240,0.98)" fontSize="12" fontWeight="800">
            hyp = {hyp}
          </text>
        </g>
      </svg>
    );
  }

  if (spec.kind === "coordinate-point") {
    return <CoordinateGrid xRange={spec.xRange} yRange={spec.yRange} points={[{ x: spec.x, y: spec.y, label: spec.label ?? "P" }]} />;
  }

  if (spec.kind === "coordinate-two-points") {
    return (
      <CoordinateGrid
        xRange={spec.xRange}
        yRange={spec.yRange}
        points={[
          { ...spec.a, color: "rgba(56,189,248,0.95)" },
          { ...spec.b, color: "rgba(251,113,133,0.95)" },
        ]}
        showLine
      />
    );
  }

  return null;
}
