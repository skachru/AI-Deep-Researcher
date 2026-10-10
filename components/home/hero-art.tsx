/**
 * Decorative hero illustration: a glowing "lumen" orb with four agent nodes
 * orbiting it, each carrying a verification tick. Pure SVG, theme-aware.
 */
export function HeroOrb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <defs>
        <radialGradient id="orb-core" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#a5acf0" />
          <stop offset="100%" stopColor="#5e6ad2" />
        </radialGradient>
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
