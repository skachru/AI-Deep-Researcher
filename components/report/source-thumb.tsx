"use client";

/* eslint-disable @next/next/no-img-element -- remote thumbnails from arbitrary source sites */
import { BookOpen, FileText, Globe, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { domainOf } from "@/components/workspace/source-pieces";
import type { SourceSummary, SourceType } from "@/lib/schemas/domain";
import { cn } from "@/lib/utils";

const cache = new Map<string, Promise<string | null>>();

/** Preview image for a web/news source via /api/og (cached per page load). */
function useOgImage(source: Pick<SourceSummary, "url" | "type" | "image">, enabled: boolean): string | null {
  const [image, setImage] = useState<string | null>(source.image ?? null);
  useEffect(() => {
    if (!enabled || source.image || (source.type !== "web" && source.type !== "news")) return;
    let alive = true;
    if (!cache.has(source.url)) {
      cache.set(
        source.url,
        fetch(`/api/og?url=${encodeURIComponent(source.url)}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ image: string | null }>) : { image: null }))
          .then((j) => j.image)
          .catch(() => null),
      );
    }
    void cache.get(source.url)?.then((img) => alive && img && setImage(img));
    return () => {
      alive = false;
    };
  }, [enabled, source.image, source.type, source.url]);
  return image;
}

const TYPE_ICON: Record<SourceType, typeof Globe> = { web: Globe, news: Newspaper, paper: FileText, wiki: BookOpen };
const TYPE_TINT: Record<SourceType, string> = {
  web: "from-[#eef0fc] to-[#f6f7fe] dark:from-[#1f2238] dark:to-[#181a2a]",
  news: "from-[#fdf3e2] to-[#fef9f0] dark:from-[#2c2213] dark:to-[#211a10]",
  paper: "from-[#e9ecfb] to-[#f3f0fd] dark:from-[#22223a] dark:to-[#1b1a2c]",
  wiki: "from-[#e8f6ef] to-[#f2faf6] dark:from-[#142a20] dark:to-[#10211a]",
};

export function Favicon({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const domain = domainOf(url);
  if (failed) return <Globe className={cn("text-subtle", className)} />;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("rounded-sm", className)}
    />
  );
}

/**
 * Thumbnail for a source: its own image (Wikipedia lead image or the page's
 * og:image) or a tinted tile with the site's favicon and type icon.
 */
export function SourceThumb({
  source,
  className,
  fetchPreview = true,
}: {
  source: Pick<SourceSummary, "url" | "type" | "image" | "title">;
  className?: string;
  fetchPreview?: boolean;
}) {
  const image = useOgImage(source, fetchPreview);
  const [broken, setBroken] = useState(false);
  const Icon = TYPE_ICON[source.type];

  if (image && !broken) {
    return (
      <div className={cn("overflow-hidden bg-surface-muted", className)}>
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className={cn("relative grid place-items-center bg-gradient-to-br", TYPE_TINT[source.type], className)}>
      <div className="grid size-9 place-items-center rounded-lg bg-surface shadow-card">
        <Favicon url={source.url} className="size-5" />
      </div>
      <Icon className="absolute right-2 bottom-2 size-3.5 text-subtle" aria-hidden />
    </div>
  );
}
