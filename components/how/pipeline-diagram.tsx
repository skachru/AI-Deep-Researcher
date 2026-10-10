import { AGENTS } from "@/components/agent-meta";

const SUBTITLES = [
  "web · news · arXiv · wiki",
  "claims · contradictions",
  "hypotheses · confidence",
  "cited report · PDF",
];

/**
 * The research pipeline as a diagram: a quick summary lane in parallel with
 * Retrieve → Analyse (↺ gaps) → Reason → Report.
 */
export function PipelineDiagram() {
  const W = 880;
  const nodeW = 168;
  const gap = (W - 40 - nodeW * 4) / 3;
  const y = 120;
  const xs = AGENTS.map((_, i) => 20 + i * (nodeW + gap));

  return (
    <svg viewBox={`0 0 ${W} 250`} className="h-auto w-full" role="img" aria-labelledby="pipeline-title">
      <title id="pipeline-title">
        Lumen pipeline: a quick summary streams in parallel while four agents retrieve, analyse, reason and report.
      </title>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>

      <rect x="20" y="16" width={W - 40} height="44" rx="10" fill="var(--accent-soft)" />
      <text x="40" y="43" fontSize="13" fontWeight="600" fill="var(--accent)">
        ⚡ Quick summary — streams within seconds, in parallel
      </text>
      <text x={W - 40} y="43" fontSize="12" textAnchor="end" fill="var(--muted)">
        replaced by the verified summary when the report is ready
      </text>

      <path
        d={`M ${xs[1] + nodeW / 2} ${y + 46} C ${xs[1] + nodeW / 2} ${y + 96}, ${xs[0] + nodeW / 2} ${y + 96}, ${xs[0] + nodeW / 2} ${y + 50}`}
        fill="none"
        stroke="var(--accent)"
        strokeOpacity="0.6"
        strokeDasharray="4 4"
        markerEnd="url(#arrow)"
      />
      <text x={(xs[0] + xs[1] + nodeW) / 2} y={y + 106} fontSize="11.5" textAnchor="middle" fill="var(--muted)">
        important gaps → targeted re-search (Standard depth)
      </text>

      {AGENTS.map((a, i) => (
        <g key={a.id}>
          {i < AGENTS.length - 1 && (
            <line
              x1={xs[i] + nodeW + 4}
              y1={y}
              x2={xs[i + 1] - 6}
              y2={y}
              stroke="var(--accent)"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
          )}
          <rect
            x={xs[i]}
            y={y - 44}
            width={nodeW}
            height="88"
            rx="12"
            fill="var(--surface)"
            stroke="var(--border-strong)"
          />
          <circle cx={xs[i] + 26} cy={y - 18} r="12" fill="var(--accent-soft)" />
          <text x={xs[i] + 26} y={y - 14} fontSize="12" fontWeight="700" textAnchor="middle" fill="var(--accent)">
            {i + 1}
          </text>
          <text x={xs[i] + 46} y={y - 14} fontSize="13" fontWeight="600" fill="var(--foreground)">
            {a.short}
          </text>
          <text x={xs[i] + 16} y={y + 12} fontSize="11.5" fill="var(--muted)">
            {a.label}
          </text>
          <text x={xs[i] + 16} y={y + 30} fontSize="11" fill="var(--subtle)">
            {SUBTITLES[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
