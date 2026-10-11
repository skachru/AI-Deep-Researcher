"use client";

import { Check, ChevronDown, Copy, Download, FileDown, FileText, Loader2, Printer, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareMenu } from "@/components/report/share-menu";
import { exportMarkdown } from "@/lib/client/report";
import type { SourceSummary } from "@/lib/schemas/domain";
import { slugify } from "@/lib/demo/examples";

export interface ReportRef {
  searchId: string | null;
  query: string;
  markdown: string;
  sources: SourceSummary[];
}

/** Body sent to /api/export and /api/email: the saved id when we have one, else the content. */
function refBody(ref: ReportRef) {
  // Send the saved id (preferred) and the content as a fallback for replays or unsaved runs.
  const sources = ref.sources.map(({ id, title, url, type, credibility, publishedDate, image }) => ({
    id,
    title,
    url,
    type,
    credibility,
    publishedDate,
    image,
  }));
  return { searchId: ref.searchId, query: ref.query, markdown: ref.markdown, sources };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function errorFrom(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const msg = (body as { error?: unknown } | null)?.error;
  return typeof msg === "string" ? msg : `Request failed (${res.status})`;
}

export async function fetchExport(report: ReportRef, format: "html" | "pdf"): Promise<Blob> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, report: refBody(report) }),
  });
  if (!res.ok) throw new Error(await errorFrom(res));
  return res.blob();
}

/**
 * Prints the designed report (not the app around it): loads the HTML export
 * into a hidden iframe and prints that frame. Falls back to printing the page.
 */
async function printReport(report: ReportRef): Promise<void> {
  const html = (await (await fetchExport(report, "html")).text())
    .replace('class="nojs"', 'class="nojs" data-print="1"')
    .replace(/ loading="lazy"/g, "");
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    window.print();
    return;
  }
  // Give images a moment to arrive before the print snapshot.
  await new Promise((r) => setTimeout(r, 400));
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup);
  setTimeout(() => frame.isConnected && frame.remove(), 120_000);
  win.focus();
  win.print();
}

export function ReportActions({ report }: { report: ReportRef }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"html" | "pdf" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = slugify(report.query) || "lumen-report";

  const run = async (kind: "html" | "pdf" | "print") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "print") await printReport(report);
      else saveBlob(await fetchExport(report, kind), `${name}.${kind}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : kind === "print" ? "Could not print" : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(exportMarkdown(report.markdown));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col items-end gap-1.5 print:hidden">
      <div className="flex items-center justify-end gap-2">
        <ShareMenu report={report} />
        <Button size="sm" onClick={() => run("print")} disabled={busy !== null} aria-label="Print report">
          {busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />}
          <span className="hidden sm:inline">Print</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="primary" disabled={busy === "html" || busy === "pdf"}>
              {busy === "html" || busy === "pdf" ? <Loader2 className="animate-spin" /> : <Download />}
              Download
              <ChevronDown className="-mr-0.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => void run("pdf")}>
              <FileDown />
              <MenuLabel title="PDF" hint="Best for sharing and printing" />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void run("html")}>
              <Sparkles />
              <MenuLabel title="Interactive HTML" hint="Filter claims, preview sources, dark mode" />
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                saveBlob(
                  new Blob([exportMarkdown(report.markdown)], { type: "text/markdown;charset=utf-8" }),
                  `${name}.md`,
                )
              }
            >
              <FileText />
              <MenuLabel title="Markdown" hint="Plain text for docs and notes" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void copy();
              }}
            >
              {copied ? <Check className="!text-success" /> : <Copy />}
              <MenuLabel title={copied ? "Copied" : "Copy as Markdown"} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function MenuLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-medium">{title}</span>
      {hint && <span className="mt-0.5 text-[11.5px] text-subtle">{hint}</span>}
    </span>
  );
}
