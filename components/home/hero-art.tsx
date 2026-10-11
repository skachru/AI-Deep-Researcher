/**
 * Decorative hero illustration: a glowing "lumen" orb with four agent nodes
 * orbiting it, each carrying a verification tick. Pure SVG, theme-aware.
 */
export function HeroOrb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <OrbCoreGradient id="orb-core" />
      <defs>
        <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5e6ad2" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#5e6ad2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="80" cy="80" r="78" fill="url(#orb-glow)" />
      <circle cx="80" cy="80" r="52" fill="none" stroke="var(--accent)" strokeOpacity="0.25" strokeDasharray="2 5" />
      <circle cx="80" cy="80" r="26" fill="url(#orb-core)" />
      {[
        [80, 28],
        [132, 80],
        [80, 132],
        [28, 80],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1="80" y1="80" x2={x} y2={y} stroke="var(--accent)" strokeOpacity="0.2" />
          <circle cx={x} cy={y} r="10" fill="var(--surface)" stroke="var(--accent)" strokeOpacity="0.5" />
          <path
            d={`M${x - 4} ${y} l3 3 l5 -6`}
            fill="none"
            stroke="var(--success)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
}

function OrbCoreGradient({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={id} cx="50%" cy="45%" r="55%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#a5acf0" />
        <stop offset="100%" stopColor="#5e6ad2" />
      </radialGradient>
    </defs>
  );
}

const NODES = [
  [80, 26],
  [134, 80],
  [80, 134],
  [26, 80],
];

/**
 * The orb as a compact brand mark for the header: same design, with bigger
 * nodes and bolder strokes so the ticks stay legible at 28px.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="8 8 144 144" className={className} aria-hidden>
      <OrbCoreGradient id="logo-core" />
      <circle cx="80" cy="80" r="54" fill="none" stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="4" />
      <circle cx="80" cy="80" r="32" fill="url(#logo-core)" />
      {NODES.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="17" fill="var(--surface)" stroke="var(--accent)" strokeWidth="4" />
          <path
            d={`M${x - 7} ${y} l5 5 l9 -10`}
            fill="none"
            stroke="var(--success)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
}

/** Soft gradient + dotted grid backdrop for hero sections. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute top-[-240px] left-1/2 h-[560px] w-[960px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(94,106,210,0.16),transparent)]" />
      <div className="absolute top-[120px] left-[8%] h-[260px] w-[260px] rounded-full bg-[radial-gradient(closest-side,rgba(240,170,90,0.12),transparent)]" />
      <div className="absolute inset-0 [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] opacity-60" />
    </div>
  );
}
