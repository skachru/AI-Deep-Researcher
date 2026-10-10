"use client";

import { Favicon } from "@/components/report/source-thumb";

const SOURCES = [
  { label: "The open web", url: "https://www.google.com" },
  { label: "News outlets", url: "https://news.google.com" },
  { label: "arXiv papers", url: "https://arxiv.org" },
  { label: "Wikipedia", url: "https://www.wikipedia.org" },
];

/** "Searches across" strip with the sources' own icons. */
export function SourceLogos() {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[11.5px] font-medium tracking-wide text-subtle uppercase">Searches across</span>
      <ul className="flex flex-wrap justify-center gap-2">
        {SOURCES.map((s) => (
          <li
            key={s.label}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted shadow-card"
          >
            <Favicon url={s.url} className="size-4" />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
