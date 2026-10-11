import { ArrowRight, Quote, ShieldCheck, Swords } from "lucide-react";
import Link from "next/link";
import { HeroBackdrop, HeroOrb } from "@/components/home/hero-art";
import { QueryForm } from "@/components/home/query-form";
import { SourceLogos } from "@/components/home/source-logos";
import { SiteHeader } from "@/components/site-header";

const PROMISES = [
  { icon: ShieldCheck, title: "Cross-checked", text: "Every key claim is tested against independent sources." },
  { icon: Quote, title: "Cited", text: "Every fact links back to the page, paper or article it came from." },
  { icon: Swords, title: "Honest about doubt", text: "Disagreements between sources are flagged, not hidden." },
];

export default function HomePage() {
  return (
    <div className="relative isolate min-h-dvh">
      <HeroBackdrop />
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-8 pb-20 sm:pt-12">
        <div className="flex items-center gap-3 sm:gap-4">
          <HeroOrb className="size-16 sm:size-20" />
          <h1 className="text-[40px] font-semibold tracking-[-0.035em] sm:text-[52px]">Lumen</h1>
        </div>
        <p className="mt-3 max-w-2xl text-center text-[19px] leading-snug font-medium tracking-[-0.01em] text-foreground/85 sm:text-[22px]">
          Every claim cross-checked. Every source cited.{" "}
          <span className="block bg-gradient-to-r from-accent to-[#9b6ad2] bg-clip-text text-transparent">
            Research you can trust.
          </span>
        </p>

        <div className="mt-7 w-full">
          <QueryForm />
        </div>

        <ul className="mt-14 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <li key={p.title} className="rounded-xl border border-border bg-surface/80 p-4 shadow-card backdrop-blur">
              <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
                <p.icon className="size-4" />
              </span>
              <div className="mt-3 text-[13.5px] font-semibold">{p.title}</div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{p.text}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col items-center gap-3">
          <SourceLogos />
          <Link href="/how-it-works" className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
            See how it works <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </main>
    </div>
  );
}
