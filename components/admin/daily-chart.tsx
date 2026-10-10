"use client";

import { useState } from "react";

interface Day {
  day: string;
  searches: number;
  failed: number;
}

const W = 720;
const H = 200;
const PAD = { top: 16, right: 8, bottom: 24, left: 32 };

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / step) * step;
}

const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Single-series column chart (searches per day, last 30 days).
 * Columns ≤ 24px with a 4px rounded top, hairline grid, max value labelled,
 * per-column hover tooltip with a full-band hit target, and a table view.
 */
export function DailyChart({ data }: { data: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.searches)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, band - 2);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const peak = data.reduce((best, d, i) => (d.searches > (data[best]?.searches ?? -1) ? i : best), 0);

  return (
    <figure>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Searches per day, last 30 days">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--subtle)">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + i * band + (band - barW) / 2;
            const h = Math.max(innerH - (y(d.searches) - PAD.top), 0);
            const top = y(d.searches);
            const r = Math.min(4, h);
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD.left + i * band} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                    fill="var(--accent)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {i === peak && d.searches > 0 && (
                  <text x={x + barW / 2} y={top - 5} textAnchor="middle" fontSize={11} fill="var(--muted)">
                    {d.searches}
                  </text>
                )}
                {(i === 0 || i === data.length - 1 || i % 7 === 0) && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--subtle)">
                    {label(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
            style={{
              left: `${((PAD.left + hover * band + band / 2) / W) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-medium">{label(data[hover].day)}</div>
            <div className="text-muted tabular-nums">
              {data[hover].searches} searches · {data[hover].failed} failed
            </div>
          </div>
        )}
      </div>
      <details className="mt-2 text-[12px] text-muted">
        <summary className="cursor-pointer select-none">View as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="text-subtle">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Searches</th>
              <th className="py-1 font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-border">
                <td className="py-1">{d.day}</td>
                <td className="py-1">{d.searches}</td>
                <td className="py-1">{d.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
