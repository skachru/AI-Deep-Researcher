/**
 * Records full research runs for demo mode.
 *
 *   npm run record                       # records all three example queries
 *   npm run record -- "custom question"  # records one query
 *   npm run record -- --standard         # Standard depth
 *
 * Output: public/demo/<slug>.json (a Recording: query, depth, events[]).
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXAMPLE_QUERIES, slugify } from "@/lib/demo/examples";
import type { Recording, ResearchEvent } from "@/lib/events/types";
import { runResearch } from "@/lib/graph/run";
import type { Depth } from "@/lib/schemas/domain";

config({ path: ".env.local" });
config();

async function record(query: string, depth: Depth): Promise<boolean> {
  const events: ResearchEvent[] = [];
  const started = Date.now();
  process.stdout.write(`Recording "${query}" (${depth})… `);
  for await (const event of runResearch({ query, depth })) {
    events.push(event);
    if (event.type === "agent_started") process.stdout.write(`${event.agent} `);
  }
  const failed = events.find((e) => e.type === "error" && !e.recoverable);
  if (failed || !events.some((e) => e.type === "report_ready")) {
    console.log(`\n  ✗ not saved: ${failed && failed.type === "error" ? failed.message : "no report produced"}`);
    return false;
  }
  const recording: Recording = { query, depth, recordedAt: new Date().toISOString(), events };
  const dir = path.join(process.cwd(), "public", "demo");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slugify(query)}.json`);
  writeFileSync(file, JSON.stringify(recording));
  console.log(
    `\n  ✓ ${events.length} events in ${((Date.now() - started) / 1000).toFixed(0)}s → ${path.relative(process.cwd(), file)}`,
  );
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const depth: Depth = args.includes("--standard") ? "standard" : "quick";
  const custom = args.filter((a) => !a.startsWith("--")).join(" ");
  const queries = custom ? [custom] : [...EXAMPLE_QUERIES];
  let ok = 0;
  for (const q of queries) if (await record(q, depth)) ok++;
  console.log(`Saved ${ok}/${queries.length} recordings.`);
  if (ok < queries.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
