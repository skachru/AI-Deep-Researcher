import { ArrowRight, BadgeCheck, FileDown, Gauge, Layers, Quote, ShieldCheck, Swords, Timer } from "lucide-react";
import Link from "next/link";
import { AGENTS } from "@/components/agent-meta";
import { HeroBackdrop } from "@/components/home/hero-art";
import { SourceLogos } from "@/components/home/source-logos";
import { PipelineDiagram } from "@/components/how/pipeline-diagram";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "How it works — Lumen",
  description: "How Lumen's four AI agents research, cross-check and cite every answer.",
};

const AGENT_DETAILS: Record<string, string[]> = {
  retriever: [
    "Breaks your question into 3–5 focused sub-questions",
    "Searches the web, news, arXiv and Wikipedia at the same time",
    "Removes duplicates and ranks the most relevant passages with BM25",
  ],
  analyst: [
    "Labels each claim Corroborated, Single-source or Disputed",
    "Puts conflicting claims side by side with their sources",
    "Scores every source's credibility (type, publisher, recency, corroboration)",
    "Spots gaps and, in Standard depth, sends the Retriever back for them",
  ],
  insight: [
    "Reasons step by step over the verified findings",
    "Proposes 3–5 hypotheses or trends",
    "Gives each a High / Medium / Low confidence and shows its reasoning",
  ],
  reporter: [
    "Writes a short summary first, then the detailed report",
    "Cites every fact inline with numbered sources",
    "Adds methodology, references and a reliability panel",
  ],
};

const TRUST = [
  {
    icon: ShieldCheck,
    title: "Independent corroboration",
    text: "A claim only counts as corroborated when two or more independent sources agree.",
  },
  {
    icon: Swords,
    title: "Contradictions surfaced",
    text: "When sources disagree you see both sides and which is better supported.",
  },
  {
    icon: Gauge,
    title: "Credibility scores",
    text: "Each source gets a 0–100 score from its type, publisher, recency and corroboration.",
  },
  { icon: Quote, title: "Inline citations", text: "Hover any [n] in the report to see the source behind it." },
  {
    icon: BadgeCheck,
    title: "Evidence strength",
    text: "Every report states whether its evidence is Strong, Moderate or Limited.",
  },
  {
    icon: Layers,
    title: "Transparent method",
    text: "The report lists what was searched, what failed and how many passes ran.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="relative isolate min-h-dvh">
      <HeroBackdrop />
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pt-14 pb-24">
        <section className="text-center">
          <div className="text-[12px] font-semibold tracking-[0.08em] text-accent uppercase">How it works</div>
          <h1 className="mx-auto mt-2 max-w-2xl text-[32px] leading-tight font-semibold tracking-[-0.03em] sm:text-[40px]">
            Four AI agents. One answer you can check.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Lumen doesn&apos;t just answer. It researches, cross-examines its sources and shows its working, so you can
            see exactly why each conclusion holds.
          </p>
        </section>

        <section
          className="mt-12 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-6"
          aria-label="Pipeline"
        >
          <PipelineDiagram />
        </section>

        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Timeline">
          {[
            { icon: Timer, t: "Seconds", d: "A quick, preliminary summary appears while research starts." },
            {
              icon: Layers,
              t: "About a minute or two",
              d: "Sources gathered, claims cross-checked, hypotheses formed.",
            },
            {
              icon: FileDown,
              t: "Done",
              d: "A verified summary and full cited report — download as PDF or HTML, or email it.",
            },
          ].map((s) => (
            <div key={s.t} className="flex gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
              <s.icon className="mt-0.5 size-4 shrink-0 text-accent" />
              <div>
                <div className="text-[13.5px] font-semibold">{s.t}</div>
                <p className="text-[12.5px] leading-relaxed text-muted">{s.d}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-20" aria-labelledby="agents">
          <h2 id="agents" className="text-center text-[24px] font-semibold tracking-tight">
            Meet the agents
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {AGENTS.map((a, i) => (
              <li
                key={a.id}
                className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card"
              >
                <span className="absolute -top-4 -right-2 text-[96px] leading-none font-bold text-accent/[0.06] select-none">
                  {i + 1}
                </span>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-[#8b6ad2] text-white shadow-card">
                    <a.icon className="size-5" />
                  </span>
                  <div>
                    <div className="text-[11.5px] font-medium text-subtle">Agent {i + 1}</div>
                    <h3 className="text-[16px] font-semibold">{a.label}</h3>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {AGENT_DETAILS[a.id].map((d) => (
                    <li key={d} className="flex gap-2 text-[13.5px] leading-snug text-muted">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" /> {d}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20" aria-labelledby="trust">
          <h2 id="trust" className="text-center text-[24px] font-semibold tracking-tight">
            Why you can trust the results
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <li key={t.title} className="rounded-xl border border-border bg-surface p-5 shadow-card">
                <t.icon className="size-5 text-accent" />
                <div className="mt-3 text-[14px] font-semibold">{t.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 flex flex-col items-center gap-8">
          <SourceLogos />
          <div className="w-full rounded-2xl bg-gradient-to-br from-accent to-[#8b6ad2] p-8 text-center text-white shadow-pop">
            <h2 className="text-[22px] font-semibold tracking-tight">Ask your first question</h2>
            <p className="mt-1 text-[14px] text-white/80">Free to try. Your history is saved in your browser.</p>
            <Button asChild size="lg" className="mt-5 border-0 bg-white text-[#3b43a8] hover:bg-white/90">
              <Link href="/">
                Start researching <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
