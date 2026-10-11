const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The personal message as simple, email-safe HTML (escaped; URLs linked). Pure. */
export function messageHtml(message: string, senderEmail: string): string {
  const body = esc(message)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#5e6ad2">$1</a>')
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;padding:24px 12px;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1b1b1f">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6e6ea;border-radius:12px;padding:28px 30px">
${body}
<div style="margin-top:22px;padding:12px 14px;border-radius:8px;background:#eef0fc;color:#3b3f9e;font-size:13px">📎 Attached: the report as a PDF and an interactive HTML version (open it in your browser).</div>
</div>
<p style="max-width:600px;margin:12px auto 0;color:#9a9ea8;font-size:12px;text-align:center">Sent via Lumen by ${esc(senderEmail)}. Reply to this email to reach them.</p>
</body></html>`;
}
