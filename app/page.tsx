import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { AGENTS } from "@/components/agent-meta";
import { QueryForm } from "@/components/home/query-form";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-20 pb-16 sm:pt-28">
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-muted shadow-card">
          <span className="size-1.5 rounded-full bg-accent" /> Multi-agent research · LangGraph + Claude
        </span>
        <h1 className="text-center text-[34px] font-semibold tracking-[-0.03em] sm:text-[44px]">Lumen</h1>
        <p className="mt-3 max-w-xl text-center text-[15px] leading-relaxed text-muted">
          Ask a hard question. Four AI agents search the web, news, arXiv and Wikipedia, cross-check the evidence, and
          hand you a cited report.
        </p>

        <div className="mt-10 w-full">
          <QueryForm />
        </div>

        <section aria-labelledby="how" className="mt-20 w-full">
          <h2 id="how" className="mb-4 text-center text-[12px] font-medium tracking-wide text-subtle uppercase">
            How it works
          </h2>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-stretch">
            {AGENTS.map((agent, i) => (
              <Fragment key={agent.id}>
                <li className="rounded-lg border border-border bg-surface p-3.5 shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md bg-accent-soft text-accent">
                      <agent.icon className="size-3.5" />
                    </span>
                    <span className="text-[13px] font-medium">{agent.label}</span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{agent.description}</p>
                </li>
                {i < AGENTS.length - 1 && (
                  <li aria-hidden className="hidden items-center text-subtle sm:flex">
                    <ChevronRight className="size-4" />
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
