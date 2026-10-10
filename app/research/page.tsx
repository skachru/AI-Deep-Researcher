import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import type { Depth } from "@/lib/schemas/domain";

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; depth?: string; replay?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim();
  if (!query) redirect("/");
  const depth: Depth = params.depth === "standard" ? "standard" : "quick";
  // key forces a fresh workspace (and a new run) when the query changes.
  return <Workspace key={`${query}-${depth}`} query={query} depth={depth} replay={params.replay === "1"} />;
}
