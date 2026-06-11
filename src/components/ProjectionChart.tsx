import { useMemo } from "react";
import { useAnimatedArray } from "../hooks/useAnimated";
import { money } from "../lib/format";

interface Props {
  historyLabels: string[];
  historyRevenue: number[]; // real actuals, SEC EDGAR
  baseProjection: number[]; // 10y base-case revenue
  scenarioProjection: number[]; // 10y scenario revenue
}

const W = 720;
const H = 280;
const PAD = { l: 54, r: 12, t: 16, b: 28 };

export function ProjectionChart({
  historyLabels,
  historyRevenue,
  baseProjection,
  scenarioProjection,
}: Props) {
  const scenario = useAnimatedArray(scenarioProjection);

  const nH = historyRevenue.length;
  const n = nH + 10;
  const maxY = useMemo(
    () => Math.max(...historyRevenue, ...baseProjection, ...scenarioProjection) * 1.08,
    [historyRevenue, baseProjection, scenarioProjection],
  );

  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (n - 1);
  const y = (v: number) => H - PAD.b - ((H - PAD.b - PAD.t) * v) / maxY;
  const path = (vals: number[], offset: number) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i + offset).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  // tie projections to the last actual so the lines are continuous
  const lastActual = historyRevenue[nH - 1];
  const basePath = path([lastActual, ...baseProjection], nH - 1);
  const scenarioPath = path([lastActual, ...scenario], nH - 1);

  const gridLines = 4;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Revenue: history and 10-year projection">
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const v = (maxY * i) / gridLines;
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-edge)" strokeWidth="1" />
              <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" className="num" fill="var(--color-ink-faint)" fontSize="9">
                {money(v)}
              </text>
            </g>
          );
        })}

        {/* divider between actuals and projection */}
        <line x1={x(nH - 1)} x2={x(nH - 1)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-edge-2)" strokeDasharray="2 4" />
        <text x={x(nH - 1) - 5} y={PAD.t + 8} textAnchor="end" fill="var(--color-ink-faint)" fontSize="9">
          actuals (SEC)
        </text>
        <text x={x(nH - 1) + 5} y={PAD.t + 8} fill="var(--color-ink-faint)" fontSize="9">
          projection
        </text>

        {/* history: real actuals */}
        <path d={path(historyRevenue, 0)} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
        {historyRevenue.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--color-ink)" />
        ))}

        {/* base case (dashed) */}
        <path d={basePath} fill="none" stroke="var(--color-ink-faint)" strokeWidth="1.25" strokeDasharray="4 4" />

        {/* scenario (accent) */}
        <path d={scenarioPath} fill="none" stroke="var(--color-accent)" strokeWidth="1.75" />

        {/* x labels */}
        {historyLabels.map((l, i) => (
          <text key={l} x={x(i)} y={H - 10} textAnchor="middle" className="num" fill="var(--color-ink-faint)" fontSize="8.5">
            {i % 2 === 0 ? l : ""}
          </text>
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <text key={i} x={x(nH + i)} y={H - 10} textAnchor="middle" className="num" fill="var(--color-ink-faint)" fontSize="8.5">
            {i % 2 === 1 ? `Y${i + 1}` : ""}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-dim">
        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 bg-ink" /> reported revenue</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-ink-faint" /> base case</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 bg-accent" /> scenario</span>
      </div>
    </div>
  );
}
