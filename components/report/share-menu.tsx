"use client";

import { Check, Link2, Loader2, Mail, MessageCircle, MoreHorizontal, Send, Share2 } from "lucide-react";
import { useState } from "react";
import type { ReportRef } from "@/components/report/report-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildShareMessage, shareHref, type ShareMessage, type ShareTarget } from "@/lib/client/share";
import { cn } from "@/lib/utils";

type LinkState = { status: "idle" | "loading" } | { status: "ready"; url: string; isReportLink: boolean };

const TARGETS: { id: ShareTarget; label: string; className: string; icon: React.ReactNode; needsLink?: boolean }[] = [
  { id: "whatsapp", label: "WhatsApp", className: "bg-[#25d366] text-white", icon: <MessageCircle /> },
  { id: "gmail", label: "Gmail", className: "bg-[#ea4335] text-white", icon: <Mail /> },
  { id: "telegram", label: "Telegram", className: "bg-[#229ed9] text-white", icon: <Send /> },
  {
    id: "linkedin",
    label: "LinkedIn",
    className: "bg-[#0a66c2] text-white",
    icon: <span className="text-[13px] font-bold">in</span>,
    needsLink: true,
  },
  {
    id: "x",
    label: "X",
    className: "bg-black text-white dark:bg-white dark:text-black",
    icon: <span className="text-[14px] font-bold">𝕏</span>,
  },
  { id: "outlook", label: "Outlook", className: "bg-[#0078d4] text-white", icon: <Mail /> },
  { id: "email", label: "Email app", className: "bg-surface-muted text-foreground", icon: <Mail /> },
];

/** Share button: creates a public link for saved reports, then offers apps to share it with. */
export function ShareMenu({ report, presetUrl }: { report: ReportRef; presetUrl?: string }) {
  const [link, setLink] = useState<LinkState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const prepare = async () => {
    if (link.status !== "idle") return;
    if (presetUrl) {
      setLink({ status: "ready", url: new URL(presetUrl, location.origin).toString(), isReportLink: true });
      return;
    }
    setLink({ status: "loading" });
    let url: string | null = null;
    if (report.searchId) {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId: report.searchId }),
      }).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as { url?: unknown } | null) : null;
      if (typeof body?.url === "string") url = body.url;
    }
    setLink({ status: "ready", url: url ?? location.origin, isReportLink: Boolean(url) });
  };

  const message: ShareMessage | null =
    link.status === "ready" ? buildShareMessage(report.query, report.markdown, link.url, link.isReportLink) : null;

  const copy = async () => {
    if (!message) return;
    await navigator.clipboard.writeText(
      link.status === "ready" && link.isReportLink ? message.url : `${message.text}\n${message.url}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Popover onOpenChange={(open) => open && void prepare()}>
      <PopoverTrigger asChild>
        <Button size="sm" aria-label="Share report">
          <Share2 />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]">
        <div className="font-medium">Share this report</div>
        {!message ? (
          <div className="flex items-center gap-2 py-6 text-[12.5px] text-muted">
            <Loader2 className="size-4 animate-spin" /> Creating a share link…
          </div>
        ) : (
          <>
            <p className="mt-0.5 text-[12px] text-muted">
              {link.status === "ready" && link.isReportLink
                ? "Anyone with the link can read the report. The link isn't listed or searchable."
                : "A link isn't available for this report, so the key findings are shared instead."}
            </p>
            <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
              {TARGETS.filter((t) => !t.needsLink || (link.status === "ready" && link.isReportLink)).map((t) => (
                <a
                  key={t.id}
                  href={shareHref(t.id, message)}
                  target={t.id === "email" ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  className="group flex flex-col items-center gap-1.5 text-[11.5px] text-muted hover:text-foreground"
                >
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-full shadow-card transition-transform duration-150 group-hover:-translate-y-0.5 [&_svg]:size-[18px]",
                      t.className,
                    )}
                  >
                    {t.icon}
                  </span>
                  {t.label}
                </a>
              ))}
              {canNativeShare && (
                <button
                  type="button"
                  onClick={() =>
                    void navigator
                      .share({ title: message.subject, text: message.text, url: message.url })
                      .catch(() => undefined)
                  }
                  className="group flex flex-col items-center gap-1.5 text-[11.5px] text-muted hover:text-foreground"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-surface-muted text-foreground shadow-card transition-transform duration-150 group-hover:-translate-y-0.5 [&_svg]:size-[18px]">
                    <MoreHorizontal />
                  </span>
                  More
                </button>
              )}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={message.url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface-muted px-2.5 text-[12px] text-muted outline-none"
              />
              <Button size="sm" variant="primary" onClick={() => void copy()}>
                {copied ? <Check /> : <Link2 />}
                {copied ? "Copied" : link.status === "ready" && link.isReportLink ? "Copy link" : "Copy text"}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
