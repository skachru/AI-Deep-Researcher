import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { type Depth, parseReportLength } from "@/lib/schemas/domain";

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; depth?: string; length?: string; replay?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim();
  if (!query) redirect("/");
  const depth: Depth = params.depth === "standard" ? "standard" : "quick";
  const length = parseReportLength(params.length);
  // key forces a fresh workspace (and a new run) when the query changes.
  return (
    <Workspace
      key={`${query}-${depth}-${length}`}
      query={query}
      depth={depth}
      length={length}
      replay={params.replay === "1"}
    />
  );
}
