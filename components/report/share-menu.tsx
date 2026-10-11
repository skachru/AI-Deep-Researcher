"use client";

import { Check, Download, FileText, Globe, Loader2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { fetchExport, type ReportRef, saveBlob } from "@/components/report/report-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { slugify } from "@/lib/demo/examples";
import { shareDescription, shareHref, shareSubject, type ShareTarget } from "@/lib/client/share";
import { cn } from "@/lib/utils";

const APPS: { id: ShareTarget; label: string; className: string; icon: React.ReactNode }[] = [
  { id: "whatsapp", label: "WhatsApp", className: "bg-[#25d366] text-white", icon: <MessageCircle /> },
  { id: "gmail", label: "Gmail", className: "bg-[#ea4335] text-white", icon: <Mail /> },
  { id: "telegram", label: "Telegram", className: "bg-[#229ed9] text-white", icon: <Send /> },
  { id: "outlook", label: "Outlook", className: "bg-[#0078d4] text-white", icon: <Mail /> },
  { id: "email", label: "Email app", className: "bg-surface-muted text-foreground", icon: <Mail /> },
];

type Files = { status: "idle" | "loading" } | { status: "ready"; files: File[] } | { status: "error"; error: string };

/**
 * Share: a short editable description plus the report as PDF and interactive
 * HTML. Where the browser supports sharing files (phones, most desktops) the
 * system share sheet sends both files to WhatsApp, Gmail, Telegram and so on.
 * Otherwise the files are downloaded and the chosen app opens with the
 * description filled in, ready for the files to be attached.
 */
export function ShareMenu({ report }: { report: ReportRef }) {
  const [files, setFiles] = useState<Files>({ status: "idle" });
  const [text, setText] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [shared, setShared] = useState(false);
  const name = slugify(report.query) || "lumen-report";
  const appUrl = typeof location === "undefined" ? "" : location.origin;
  const message = text ?? shareDescription(report.query, report.markdown, appUrl);
  const subject = shareSubject(report.query);

  const prepare = async () => {
    if (files.status === "loading" || files.status === "ready") return;
    setFiles({ status: "loading" });
    try {
      const [pdf, html] = await Promise.all([fetchExport(report, "pdf"), fetchExport(report, "html")]);
      setFiles({
        status: "ready",
        files: [
          new File([pdf], `${name}.pdf`, { type: "application/pdf" }),
          new File([html], `${name}.html`, { type: "text/html" }),
        ],
      });
    } catch (err) {
      setFiles({ status: "error", error: err instanceof Error ? err.message : "Could not prepare the files" });
    }
  };

  const ready = files.status === "ready" ? files.files : null;
  // Share the files the platform accepts (some don't take HTML); null when file sharing isn't supported.
  const shareable = (() => {
    if (!ready || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return null;
    if (navigator.canShare({ files: ready })) return ready;
    return navigator.canShare({ files: [ready[0]] }) ? [ready[0]] : null;
  })();

  const shareNative = async () => {
    if (!shareable) return;
    try {
      await navigator.share({ title: subject, text: message, files: shareable });
      setShared(true);
    } catch {
      // cancelled or refused by the target app: nothing to do
    }
  };

  const downloadFiles = () => {
    if (!ready || downloaded) return;
    ready.forEach((f, i) => setTimeout(() => saveBlob(f, f.name), i * 400));
    setDownloaded(true);
  };

  return (
    <Popover onOpenChange={(open) => open && void prepare()}>
      <PopoverTrigger asChild>
        <Button size="sm" aria-label="Share report">
          <Share2 />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px]">
        <div className="font-medium">Share this report</div>
        <label className="mt-3 block text-[11.5px] font-medium text-subtle" htmlFor="share-message">
          Message
        </label>
        <textarea
          id="share-message"
          value={message}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-1 block w-full resize-none rounded-md border border-border bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed outline-none focus:border-accent/60"
        />

        <div className="mt-3 text-[11.5px] font-medium text-subtle">Attachments</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {[
            { icon: <FileText />, label: "PDF report" },
            { icon: <Globe />, label: "Interactive HTML" },
          ].map((a) => (
            <span
              key={a.label}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-1 text-[11.5px] text-muted [&_svg]:size-3.5"
            >
              {files.status === "loading" ? <Loader2 className="animate-spin" /> : a.icon}
              {a.label}
            </span>
          ))}
        </div>
        {files.status === "error" && <p className="mt-2 text-[12px] text-danger">{files.error}</p>}

        {shareable && (
          <Button variant="primary" className="mt-4 w-full" onClick={() => void shareNative()}>
            {shared ? <Check /> : <Share2 />}
            {shared ? "Shared" : `Share with ${shareable.length === 2 ? "PDF + HTML" : "PDF"} attached`}
          </Button>
        )}

        <div className="mt-4 text-[11.5px] font-medium text-subtle">{shareable ? "Or open in" : "Open in"}</div>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {APPS.map((t) => (
            <a
              key={t.id}
              href={shareHref(t.id, subject, message, appUrl)}
              target={t.id === "email" ? undefined : "_blank"}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!ready) e.preventDefault();
                else downloadFiles();
              }}
              aria-disabled={!ready}
              className={cn(
                "group flex flex-col items-center gap-1.5 text-center text-[11px] leading-tight text-muted hover:text-foreground",
                !ready && "pointer-events-none opacity-50",
              )}
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
        </div>
        <p
          className={cn(
            "mt-3 flex items-start gap-1.5 text-[11.5px] leading-snug",
            downloaded ? "text-success" : "text-subtle",
          )}
        >
          <Download className="mt-px size-3.5 shrink-0" />
          {downloaded
            ? "PDF and HTML downloaded. Attach them to your message in the app that just opened."
            : "These apps can't receive files from a website, so we'll download the PDF and HTML for you to attach."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
