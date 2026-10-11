import type { ReportDocument } from "@/lib/report/payload";
import { extractSummary, markdownToSafeHtml } from "@/lib/report/markdown";
import type { ExportSource } from "@/lib/report/payload";
import { computeReliability, splitReferences, STRENGTH_COPY, stripTitle } from "@/lib/report/reliability";

/**
 * The downloadable HTML report: a self-contained, interactive page (no
 * external scripts) with a reading-progress bar, scroll-synced contents,
 * an evidence ring, key takeaways, claim filters, citation previews that
 * jump to the source, filterable source cards, dark mode and print.
 *
 * Report text derives from web content, so all of it goes through
 * markdownToSafeHtml / esc; the inline script only reads the DOM.
 * The email body stays the static renderReportHtml (mail clients drop scripts).
 */

export interface InteractiveReportDocument extends ReportDocument {
  /** Public URL of the app, used for the "research another question" call to action. */
  appUrl?: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const httpsUrl = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? esc(u) : null);
const appLink = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? esc(u.replace(/\/$/, "")) : null);

const domain = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const TYPE_LABEL = { web: "Web", news: "News", paper: "Paper", wiki: "Wikipedia" } as const;

/** Removes the "## Summary" section (it is shown as Key takeaways). Pure. */
export function withoutSummary(markdown: string): string {
  return markdown.replace(/^##\s+(?:Executive\s+)?Summary\s*$[\s\S]*?(?=^##\s|(?![\s\S]))/im, "");
}

/** Turns "<sup class="cite">[1, 3]</sup>" into links to the source cards. Pure. */
export function linkCitations(html: string, known: Set<number>): string {
  return html.replace(/<sup class="cite">\[([\d,\s]+)\]<\/sup>/g, (_, group: string) => {
    const links = group
      .split(",")
      .map((n) => Number(n.trim()))
      .map((n) =>
        known.has(n) ? `<a class="cite" href="#src-${n}" data-n="${n}">${n}</a>` : `<span class="cite">${n}</span>`,
      )
      .join("");
    return `<span class="cites">${links}</span>`;
  });
}

function ring(corroborated: number, single: number, disputed: number): string {
  const total = corroborated + single + disputed;
  const C = 2 * Math.PI * 52;
  let offset = 0;
  const arc = (n: number, color: string) => {
    if (!n) return "";
    const len = (n / total) * C;
    const out = `<circle class="arc" cx="64" cy="64" r="52" stroke="${color}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset += len;
    return out;
  };
  const pct = total ? Math.round((corroborated / total) * 100) : 0;
  return `<svg class="ring" viewBox="0 0 128 128" aria-hidden="true">
  <circle cx="64" cy="64" r="52" stroke="var(--line)" />
  <g transform="rotate(-90 64 64)">${total ? arc(corroborated, "var(--ok)") + arc(single, "var(--neutral)") + arc(disputed, "var(--bad)") : ""}</g>
  <text x="64" y="62" text-anchor="middle" class="ring-n"><tspan data-count="${pct}">${pct}</tspan>%</text>
  <text x="64" y="80" text-anchor="middle" class="ring-l">corroborated</text>
</svg>`;
}

function sourceCards(sources: ExportSource[]): string {
  return [...sources]
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .map((s) => {
      const n = esc(s.id.slice(1));
      const url = httpsUrl(s.url) ?? (s.url.startsWith("http://") ? esc(s.url) : "#");
      const thumb = httpsUrl(s.image);
      const cred = Math.max(0, Math.min(100, Math.round(s.credibility)));
      const visual = thumb
        ? `<img class="thumb" src="${thumb}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`
        : `<span class="thumb fav">${esc(domain(s.url).charAt(0).toUpperCase())}<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain(s.url))}&amp;sz=64" width="22" height="22" alt="" loading="lazy" onerror="this.remove()"></span>`;
      const meta = esc([TYPE_LABEL[s.type], domain(s.url), s.publishedDate].filter(Boolean).join(" · "));
      return `<a class="src reveal" id="src-${n}" data-type="${s.type}" data-meta="${meta}" href="${url}" target="_blank" rel="noopener noreferrer">
  ${visual}
  <span class="src-body">
    <span class="src-meta"><b class="num">${n}</b><span class="tag t-${s.type}">${TYPE_LABEL[s.type]}</span>${esc(domain(s.url))}${s.publishedDate ? ` · ${esc(s.publishedDate)}` : ""}</span>
    <span class="src-title">${esc(s.title)}</span>
    <span class="cred" title="Credibility ${cred}/100"><i style="--w:${cred}%"></i></span>
    <span class="cred-l">Credibility <b>${cred}</b>/100</span>
  </span>
</a>`;
    })
    .join("\n");
}

const STYLES = `
:root{--bg:#f6f6f9;--surface:#fff;--soft:#f3f3f7;--fg:#17171c;--muted:#5f6370;--subtle:#9a9ea8;--line:#e7e7ec;--accent:#5e6ad2;--accent2:#9b6ad2;--accent-soft:#eef0fc;--ok:#2f9e6c;--ok-soft:#e8f6ef;--bad:#d14a4a;--bad-soft:#fcebeb;--warn:#c27a12;--warn-soft:#fdf3e2;--neutral:#c9c9d2;--shadow:0 1px 2px rgba(16,16,24,.04),0 8px 24px -12px rgba(16,16,24,.12);color-scheme:light}
:root[data-theme=dark]{--bg:#0e0e12;--surface:#16161c;--soft:#1d1d25;--fg:#ececf1;--muted:#a3a6b2;--subtle:#727684;--line:#2a2a33;--accent:#7c86e6;--accent2:#b18be6;--accent-soft:#1f2140;--ok:#4cc38a;--ok-soft:#15281f;--bad:#ef6b6b;--bad-soft:#2d1717;--warn:#e4a23f;--warn-soft:#2b2112;--neutral:#4a4a56;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.6);color-scheme:dark}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:15.5px/1.7 Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;transition:background .25s,color .25s}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top-in{max-width:1180px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;gap:10px}
.brand{display:flex;align-items:center;gap:8px;font-weight:650;letter-spacing:-.01em;color:var(--fg)}
.brand svg{width:26px;height:26px}
.top .q{flex:1;min-width:0;color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .2s}
.top.scrolled .q{opacity:1}
.btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:500 13px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:var(--shadow);text-decoration:none!important;white-space:nowrap}
.btn:hover{border-color:var(--accent)}.btn svg{width:15px;height:15px}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;color:#fff}
.progress{position:absolute;left:0;bottom:-1px;height:2px;width:100%;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,var(--accent),var(--accent2))}
.hero{position:relative;overflow:hidden;border-bottom:1px solid var(--line);background:radial-gradient(900px 400px at 15% -10%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%),radial-gradient(700px 360px at 95% 10%,color-mix(in srgb,#f0aa5a 18%,transparent),transparent 70%)}
.hero::after{content:"";position:absolute;inset:0;background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(to bottom,#000,transparent 80%);-webkit-mask-image:linear-gradient(to bottom,#000,transparent 80%);pointer-events:none}
.hero-in{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:48px 20px 40px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:36px;align-items:center}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--accent)}
.eyebrow i{width:6px;height:6px;border-radius:99px;background:var(--ok);box-shadow:0 0 0 4px var(--ok-soft)}
.hero h1{font-size:clamp(28px,4.2vw,44px);line-height:1.12;letter-spacing:-.03em;margin:14px 0 12px}
.hero .meta{color:var(--muted);font-size:13.5px}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:4px 11px;font-size:12.5px;font-weight:650}
.chip.Strong{background:var(--ok-soft);color:var(--ok)}.chip.Moderate{background:var(--accent-soft);color:var(--accent)}.chip.Limited{background:var(--warn-soft);color:var(--warn)}
.strength{margin-top:18px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;color:var(--muted);font-size:13px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:26px;max-width:640px}
.stat{background:color-mix(in srgb,var(--surface) 85%,transparent);border:1px solid var(--line);border-radius:12px;padding:12px 14px;box-shadow:var(--shadow)}
.stat b{display:block;font-size:24px;letter-spacing:-.02em;line-height:1.1}.stat span{font-size:11.5px;color:var(--subtle)}
.ring-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px}
.ring{width:190px;height:190px;filter:drop-shadow(0 10px 30px color-mix(in srgb,var(--accent) 25%,transparent))}
.ring circle{fill:none;stroke-width:12}.ring .arc{stroke-linecap:butt;transition:stroke-dasharray 1.2s cubic-bezier(.2,.7,.2,1)}
.ring-n{font-size:28px;font-weight:700;fill:var(--fg);letter-spacing:-.02em}.ring-l{font-size:9.5px;fill:var(--subtle);text-transform:uppercase;letter-spacing:.08em}
.legend{display:flex;gap:12px;font-size:12px;color:var(--muted)}.legend i{display:inline-block;width:8px;height:8px;border-radius:99px;margin-right:5px}
.cover-img{position:absolute;right:20px;top:20px;width:88px;height:88px;border-radius:14px;object-fit:cover;border:2px solid var(--surface);box-shadow:var(--shadow);transform:rotate(4deg)}
.layout{max-width:1180px;margin:0 auto;padding:34px 20px 20px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:44px}
.toc{position:sticky;top:76px;align-self:start;max-height:calc(100vh - 96px);overflow:auto;font-size:13px}
.toc .h{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--subtle);margin-bottom:8px}
.toc a{display:block;color:var(--muted);padding:5px 0 5px 12px;border-left:2px solid var(--line);line-height:1.35;text-decoration:none}
.toc a.l3{padding-left:24px;font-size:12.5px}.toc a:hover{color:var(--fg)}.toc a.on{color:var(--fg);border-color:var(--accent);font-weight:550}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}
.takeaways{padding:24px 26px;margin-bottom:30px;position:relative;overflow:hidden}
.takeaways::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2),#f0aa5a)}
.takeaways h2{margin:0 0 4px!important;font-size:13px!important;letter-spacing:.08em!important;text-transform:uppercase;color:var(--accent)}
.takeaways ul{list-style:none;padding:0;margin:12px 0 0;counter-reset:k;display:grid;gap:10px}
.takeaways li{counter-increment:k;position:relative;padding:12px 14px 12px 52px;border-radius:12px;background:var(--soft);margin:0;font-size:15px;line-height:1.6}
.takeaways li::before{content:counter(k);position:absolute;left:14px;top:12px;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:13px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2))}
.filters{position:sticky;top:60px;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;margin:6px 0 10px;background:var(--bg)}
.filters .lbl{font-size:12px;color:var(--subtle);margin-right:2px}
.f{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:99px;padding:4px 12px;font:550 12.5px Inter,system-ui,sans-serif;cursor:pointer}
.f b{font-weight:700;margin-left:4px}.f.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.f[data-f=Corroborated].on{border-color:var(--ok);color:var(--ok);background:var(--ok-soft)}.f[data-f=Disputed].on{border-color:var(--bad);color:var(--bad);background:var(--bad-soft)}
article h2{font-size:23px;letter-spacing:-.02em;margin:40px 0 12px;scroll-margin-top:120px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none}
article h2 .chev{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:var(--subtle);transition:transform .2s;flex-shrink:0}
article h2:hover .chev{background:var(--soft);color:var(--fg)}
.sec.closed>h2 .chev{transform:rotate(-90deg)}.sec.closed>.sec-body{display:none}
article h3{font-size:16.5px;margin:26px 0 8px;letter-spacing:-.01em;scroll-margin-top:120px}
article ul,article ol{padding-left:22px}article li{margin:8px 0;transition:opacity .2s}
article table{border-collapse:collapse;width:100%;font-size:13.5px;display:block;overflow:auto}article th,article td{border:1px solid var(--line);padding:7px 10px;text-align:left}
article blockquote{margin:16px 0;padding:4px 16px;border-left:3px solid var(--accent);color:var(--muted)}
.claim{display:inline-block;font-size:11px;font-weight:650;border-radius:99px;padding:1px 8px;margin-left:6px;vertical-align:1px;white-space:nowrap}
.claim-corroborated{background:var(--ok-soft);color:var(--ok)}.claim-disputed{background:var(--bad-soft);color:var(--bad)}.claim-single-source{background:var(--soft);color:var(--muted)}
.dim{opacity:.22}
.cites{white-space:nowrap}
.cite{display:inline-grid;place-items:center;min-width:19px;height:18px;padding:0 4px;margin-left:2px;border-radius:5px;border:1px solid var(--line);background:var(--soft);color:var(--muted);font-size:11px;font-weight:600;vertical-align:2px;text-decoration:none!important;cursor:pointer}
a.cite:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.tip{position:fixed;z-index:50;max-width:320px;padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line);box-shadow:0 12px 32px -8px rgba(0,0,0,.25);font-size:12.5px;line-height:1.45;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s}
.tip.show{opacity:1;transform:none}.tip .m{color:var(--subtle);font-size:11.5px}.tip .t{font-weight:600;margin:3px 0 6px}
.src-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:48px 0 14px}
.src-head h2{margin:0!important;cursor:default}
.sources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.src{display:flex;gap:12px;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--fg);text-decoration:none!important;box-shadow:var(--shadow);transition:transform .15s,border-color .15s,box-shadow .15s;scroll-margin-top:130px}
.src:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--accent) 50%,var(--line))}
.src.flash{animation:flash 1.6s ease}@keyframes flash{0%,40%{box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 45%,transparent);border-color:var(--accent)}}
.src.hide{display:none}
.thumb{width:68px;height:68px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--soft)}.fav{position:relative;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:20px}.fav img{position:absolute;inset:0;margin:auto;background:var(--accent-soft)}
.src-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.src-meta{font-size:11.5px;color:var(--subtle);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.num{display:inline-grid;place-items:center;min-width:18px;height:18px;border-radius:5px;background:var(--soft);color:var(--muted);font-size:10.5px}
.tag{border-radius:5px;padding:0 6px;font-weight:650;font-size:10.5px}.t-web{background:var(--accent-soft);color:var(--accent)}.t-news{background:var(--warn-soft);color:var(--warn)}.t-paper{background:var(--ok-soft);color:var(--ok)}.t-wiki{background:var(--soft);color:var(--muted)}
.src-title{font-size:13.5px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cred{height:5px;border-radius:99px;background:var(--soft);overflow:hidden;margin-top:4px}.cred i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width 1s cubic-bezier(.2,.7,.2,1)}
.src.in .cred i{width:var(--w)}.cred-l{font-size:11px;color:var(--subtle)}
.cta{margin:56px 0 24px;padding:30px;border-radius:20px;color:#fff;background:linear-gradient(135deg,#4e59c9,#8a5bd0 60%,#d58a4a);display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between;box-shadow:0 20px 50px -20px rgba(94,106,210,.6)}
.cta h3{margin:0;font-size:22px;letter-spacing:-.02em}.cta p{margin:6px 0 0;opacity:.85;font-size:14px}
.cta a{background:#fff;color:#3b3f9e;font-weight:650;border-radius:10px;padding:11px 18px;text-decoration:none!important;white-space:nowrap}
.foot{max-width:1180px;margin:0 auto;padding:20px;color:var(--subtle);font-size:12px}
.reveal{opacity:0;transform:translateY(10px);transition:opacity .5s ease,transform .5s ease}.reveal.in{opacity:1;transform:none}
.nojs .reveal{opacity:1;transform:none}.nojs .cred i{width:var(--w)}
@media (max-width:960px){.layout{grid-template-columns:1fr}.toc{display:none}.hero-in{grid-template-columns:1fr}.ring-wrap{flex-direction:row;justify-content:flex-start}.ring{width:140px;height:140px}.cover-img{display:none}}
@media (max-width:640px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sources{grid-template-columns:1fr}.top .q,.hide-sm{display:none}.legend{flex-direction:column;gap:4px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}.reveal{opacity:1;transform:none}.cred i{width:var(--w)}}
@media print{.top,.toc,.filters,.cta,.chev,.tip,.src-tools{display:none!important}body{background:#fff;color:#000}.layout{display:block;padding:0}.hero{background:none}.hero::after{display:none}.sec.closed>.sec-body{display:block!important}.reveal{opacity:1!important;transform:none!important}.cred i{width:var(--w)!important}.src{break-inside:avoid;box-shadow:none}.card{box-shadow:none}.dim{opacity:1}}
`;

const ICONS = {
  print:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
};

const LOGO = `<svg viewBox="8 8 144 144" aria-hidden="true"><defs><radialGradient id="lc" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="45%" stop-color="#a5acf0"/><stop offset="100%" stop-color="#5e6ad2"/></radialGradient></defs><circle cx="80" cy="80" r="54" fill="none" stroke="var(--accent)" stroke-opacity=".45" stroke-width="4"/><circle cx="80" cy="80" r="32" fill="url(#lc)"/>${[
  [80, 26],
  [134, 80],
  [80, 134],
  [26, 80],
]
  .map(
    ([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="17" fill="var(--surface)" stroke="var(--accent)" stroke-width="4"/><path d="M${x - 7} ${y} l5 5 l9 -10" fill="none" stroke="var(--ok)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  )
  .join("")}</svg>`;

/** Client behaviour. Reads only the DOM; never evaluates report content. */
const SCRIPT = `(function(){
var d=document,root=d.documentElement;root.classList.remove('nojs');
try{var t=localStorage.getItem('lumen-theme');if(t)root.dataset.theme=t;else if(matchMedia('(prefers-color-scheme: dark)').matches)root.dataset.theme='dark'}catch(e){}
d.getElementById('theme').onclick=function(){var n=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=n;try{localStorage.setItem('lumen-theme',n)}catch(e){}};
d.getElementById('print').onclick=function(){d.querySelectorAll('.sec.closed').forEach(function(s){s.classList.remove('closed')});window.print()};
var art=d.querySelector('article'),host=d.querySelector('main')||art,top=d.querySelector('.top'),bar=d.querySelector('.progress');
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
/* wrap each h2 section so it can collapse */
var hs=[].slice.call(art.querySelectorAll(':scope > h2'));
hs.forEach(function(h){var sec=d.createElement('section');sec.className='sec';var body=d.createElement('div');body.className='sec-body';h.parentNode.insertBefore(sec,h);sec.appendChild(h);var n=sec.nextSibling;while(n&&!(n.nodeType===1&&(n.tagName==='H2'||n.classList.contains('src-head')||n.classList.contains('cta')))){var x=n.nextSibling;body.appendChild(n);n=x}sec.appendChild(body);
var c=d.createElement('span');c.className='chev';c.innerHTML=${JSON.stringify(ICONS.chev)};h.insertBefore(c,h.firstChild);h.setAttribute('role','button');h.setAttribute('tabindex','0');h.setAttribute('aria-expanded','true');
function tog(){sec.classList.toggle('closed');h.setAttribute('aria-expanded',String(!sec.classList.contains('closed')))}h.onclick=tog;h.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();tog()}}});
/* table of contents with scrollspy */
var toc=d.getElementById('toc'),heads=[].slice.call(art.querySelectorAll('h2,h3')).filter(function(h){return !h.closest('.takeaways,.cta')});
heads.forEach(function(h){var txt=h.textContent.replace(/\\s*\\d+(\\s*\\d+)*\\s*$/,'').trim();if(!h.id)h.id=slug(txt)||('s'+Math.random().toString(36).slice(2,7));var a=d.createElement('a');a.href='#'+h.id;a.textContent=txt;if(h.tagName==='H3')a.className='l3';a.onclick=function(){var s=h.closest('.sec');if(s)s.classList.remove('closed')};toc.appendChild(a)});
var links=[].slice.call(toc.querySelectorAll('a'));
function spy(){var y=scrollY+140,cur=null;heads.forEach(function(h,i){if(h.offsetParent&&h.getBoundingClientRect().top+scrollY<=y)cur=i});links.forEach(function(a,i){a.classList.toggle('on',i===cur)});
var max=d.body.scrollHeight-innerHeight;bar.style.transform='scaleX('+(max>0?Math.min(1,scrollY/max):0)+')';top.classList.toggle('scrolled',scrollY>260)}
addEventListener('scroll',spy,{passive:true});spy();
/* claim filters */
var claims=[].slice.call(art.querySelectorAll('.claim'));claims.forEach(function(c){var el=c.closest('li,p');if(el)el.dataset.claim=c.textContent});
d.querySelectorAll('.f').forEach(function(b){b.onclick=function(){var f=b.dataset.f;d.querySelectorAll('.f').forEach(function(x){x.classList.toggle('on',x===b)});art.querySelectorAll('[data-claim]').forEach(function(el){el.classList.toggle('dim',f!=='all'&&el.dataset.claim!==f)})}});
/* citation previews + jump to source (Key takeaways and the report body) */
var tip=d.createElement('div');tip.className='tip';d.body.appendChild(tip);
function card(n){return d.getElementById('src-'+n)}
host.addEventListener('mouseover',function(e){var a=e.target.closest&&e.target.closest('a.cite');if(!a)return;var c=card(a.dataset.n);if(!c)return;
tip.textContent='';var m=d.createElement('div');m.className='m';m.textContent=c.dataset.meta;var tt=d.createElement('div');tt.className='t';tt.textContent=c.querySelector('.src-title').textContent;var cr=d.createElement('div');cr.className='m';cr.textContent=c.querySelector('.cred-l').textContent+' · click to view';tip.append(m,tt,cr);
var r=a.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-330,r.left-20))+'px';tip.style.top=(r.bottom+8+120>innerHeight?r.top-tip.offsetHeight-8:r.bottom+8)+'px';tip.classList.add('show')});
host.addEventListener('mouseout',function(e){if(e.target.closest&&e.target.closest('a.cite'))tip.classList.remove('show')});
host.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.cite');if(!a)return;var c=card(a.dataset.n);if(!c)return;e.preventDefault();tip.classList.remove('show');
var s=d.querySelector('.f-src[data-t="all"]');if(s)s.click();c.scrollIntoView({behavior:'smooth',block:'center'});c.classList.remove('flash');void c.offsetWidth;c.classList.add('flash')});
/* source type filter */
d.querySelectorAll('.f-src').forEach(function(b){b.onclick=function(){var t=b.dataset.t;d.querySelectorAll('.f-src').forEach(function(x){x.classList.toggle('on',x===b)});d.querySelectorAll('.src').forEach(function(s){s.classList.toggle('hide',t!=='all'&&s.dataset.type!==t)})}});
/* reveal on scroll + count-up */
var io='IntersectionObserver' in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -40px 0px'}):null;
d.querySelectorAll('.reveal').forEach(function(el){io?io.observe(el):el.classList.add('in')});
if(!root.dataset.print&&!matchMedia('(prefers-reduced-motion: reduce)').matches){d.querySelectorAll('[data-count]').forEach(function(el){var end=+el.dataset.count,t0=null;function step(ts){t0=t0||ts;var p=Math.min(1,(ts-t0)/900);el.textContent=Math.round(end*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step)}requestAnimationFrame(step)});
d.querySelectorAll('.ring .arc').forEach(function(a){var full=a.getAttribute('stroke-dasharray');var C=full.split(' ').reduce(function(x,y){return x+ +y},0);a.setAttribute('stroke-dasharray','0 '+C);requestAnimationFrame(function(){requestAnimationFrame(function(){a.setAttribute('stroke-dasharray',full)})})})}
})();`;

/** A self-contained, interactive HTML report for download. */
export function renderInteractiveReportHtml(doc: InteractiveReportDocument): string {
  const sources = doc.sources ?? [];
  const r = computeReliability(doc.markdown, sources);
  const { corroborated, singleSource, disputed, total } = r.claims;
  const { body, references } = splitReferences(doc.markdown);
  const summary = extractSummary(doc.markdown);
  const known = new Set(sources.map((s) => Number(s.id.slice(1))));
  const rest = withoutSummary(stripTitle(body)) + (sources.length ? "" : references);
  const main = linkCitations(markdownToSafeHtml(rest), known);
  const takeaways = summary ? linkCitations(markdownToSafeHtml(summary), known) : "";
  const cover = httpsUrl(sources.find((s) => s.image)?.image);
  const app = appLink(doc.appUrl);
  const typeCount = (t: ExportSource["type"]) => sources.filter((s) => s.type === t).length;
  const date = doc.generatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const filterBtn = (f: string, label: string, n?: number) =>
    `<button class="f${f === "all" ? " on" : ""}" data-f="${f}">${label}${n === undefined ? "" : `<b>${n}</b>`}</button>`;
  const srcBtn = (t: string, label: string, n: number) =>
    n || t === "all"
      ? `<button class="f f-src${t === "all" ? " on" : ""}" data-t="${t}">${label}<b>${n}</b></button>`
      : "";

  return `<!doctype html>
<html lang="en" class="nojs">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${esc(doc.query)} — Lumen research report</title>
<style>${STYLES}</style>
</head>
<body>
<header class="top"><div class="top-in">
  ${app ? `<a class="brand" href="${app}" target="_blank" rel="noopener">${LOGO}Lumen</a>` : `<span class="brand">${LOGO}Lumen</span>`}
  <span class="q">${esc(doc.query)}</span>
  <span style="flex:1" class="hide-sm"></span>
  <button class="btn" id="theme" title="Toggle dark mode" aria-label="Toggle dark mode">${ICONS.moon}</button>
  <button class="btn" id="print" title="Print report">${ICONS.print}<span class="hide-sm">Print</span></button>
  ${app ? `<a class="btn primary hide-sm" href="${app}" target="_blank" rel="noopener">Ask Lumen a question</a>` : ""}
</div><div class="progress"></div></header>

<section class="hero"><div class="hero-in">
  <div>
    <span class="eyebrow"><i></i>Lumen research report · ${esc(date)}</span>
    <h1>${esc(doc.query)}</h1>
    <div class="meta">Researched by four cooperating AI agents and cross-checked across ${sources.length} sources.</div>
    <div class="strength"><span class="chip ${r.strength}">${r.strength} evidence</span>${esc(STRENGTH_COPY[r.strength])}</div>
    <div class="stats">
      <div class="stat"><b data-count="${r.sources.total}">${r.sources.total}</b><span>sources checked</span></div>
      <div class="stat"><b data-count="${total}">${total}</b><span>claims verified</span></div>
      <div class="stat"><b data-count="${disputed}">${disputed}</b><span>disputed claims</span></div>
      <div class="stat"><b data-count="${r.sources.avgCredibility}">${r.sources.avgCredibility}</b><span>avg. credibility</span></div>
    </div>
  </div>
  <div class="ring-wrap">
    ${ring(corroborated, singleSource, disputed)}
    <div class="legend"><span><i style="background:var(--ok)"></i>Corroborated ${corroborated}</span><span><i style="background:var(--neutral)"></i>Single-source ${singleSource}</span><span><i style="background:var(--bad)"></i>Disputed ${disputed}</span></div>
  </div>
  ${cover ? `<img class="cover-img" src="${cover}" alt="" referrerpolicy="no-referrer">` : ""}
</div></section>

<div class="layout">
  <nav class="toc" aria-label="Contents"><div class="h">On this page</div><div id="toc"></div></nav>
  <main>
    ${takeaways ? `<section class="card takeaways reveal" id="key-takeaways"><h2>Key takeaways</h2>${takeaways}</section>` : ""}
    ${
      total
        ? `<div class="filters" role="toolbar" aria-label="Filter claims"><span class="lbl">Highlight claims:</span>${filterBtn("all", "All", total)}${filterBtn("Corroborated", "Corroborated", corroborated)}${filterBtn("Single-source", "Single-source", singleSource)}${filterBtn("Disputed", "Disputed", disputed)}</div>`
        : ""
    }
    <article>
${main}
${
  sources.length
    ? `<div class="src-head"><h2 id="sources">Sources</h2><div class="src-tools">${srcBtn("all", "All", sources.length)}${srcBtn("web", "Web", typeCount("web"))}${srcBtn("news", "News", typeCount("news"))}${srcBtn("paper", "Papers", typeCount("paper"))}${srcBtn("wiki", "Wikipedia", typeCount("wiki"))}</div></div>
<div class="sources">${sourceCards(sources)}</div>`
    : ""
}
${
  app
    ? `<div class="cta"><div><h3>Got another question?</h3><p>Lumen cross-checks every claim and cites every source, in minutes.</p></div><a href="${app}" target="_blank" rel="noopener">Start new research &rarr;</a></div>`
    : ""
}
    </article>
  </main>
</div>
<footer class="foot">Generated by Lumen on ${esc(doc.generatedAt.toUTCString())}. Claims are labelled Corroborated (two or more independent sites), Single-source or Disputed. Credibility is a guide, not a fact-check.</footer>
<script>${SCRIPT}</script>
</body>
</html>`;
}
