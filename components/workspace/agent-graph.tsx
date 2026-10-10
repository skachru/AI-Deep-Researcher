"use client";

import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check } from "lucide-react";
import { memo, useMemo } from "react";
import { AGENTS } from "@/components/agent-meta";
import type { AgentStatus, ResearchViewState } from "@/lib/client/reducer";
import type { AgentId } from "@/lib/schemas/domain";
import { cn } from "@/lib/utils";

type AgentNodeData = { agent: AgentId; status: AgentStatus; detail: string };
type AgentNode = Node<AgentNodeData, "agent">;
type SpacerNodeType = Node<Record<string, never>, "spacer">;

const AgentNodeView = memo(function AgentNodeView({ data }: NodeProps<AgentNode>) {
  const meta = AGENTS.find((a) => a.id === data.agent)!;
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "flex w-[208px] items-center gap-2.5 rounded-lg border bg-surface px-3 py-2.5 shadow-card transition-colors duration-200",
        data.status === "active" && "border-accent animate-pulse-ring",
        data.status === "done" && "border-border-strong",
        data.status === "idle" && "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} id="in" className="!size-1.5 !border-0 !bg-border-strong" />
      <Handle type="source" position={Position.Bottom} id="out" className="!size-1.5 !border-0 !bg-border-strong" />
      <Handle type="source" position={Position.Right} id="loop-out" className="!size-1 !border-0 !bg-transparent" />
      <Handle type="target" position={Position.Right} id="loop-in" className="!size-1 !border-0 !bg-transparent" />
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-200",
          data.status === "active" ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent",
          data.status === "done" && "bg-success-soft text-success",
        )}
      >
        {data.status === "done" ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium">{meta.label}</div>
        <div className={cn("truncate text-[11.5px]", data.status === "active" ? "text-accent" : "text-subtle")}>
          {data.detail}
        </div>
      </div>
    </div>
  );
});

/** Invisible node that reserves room on the right so fitView keeps the loop-back edge in frame. */
function SpacerNode() {
  return <div className="h-px w-px" />;
}

const nodeTypes = { agent: AgentNodeView, spacer: SpacerNode };

const Y_GAP = 96;

function edgeStyle(state: "idle" | "active" | "done"): Pick<Edge, "animated" | "style" | "markerEnd"> {
  const color = state === "idle" ? "var(--border-strong)" : "var(--accent)";
  return {
    animated: state === "active",
    style: { stroke: color, strokeWidth: state === "idle" ? 1.25 : 1.75, opacity: state === "done" ? 0.55 : 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
  };
}

function detailFor(agent: AgentId, view: ResearchViewState): string {
  const status = view.agents[agent];
  if (status === "idle") return "Waiting";
  if (agent === "retriever") return `${view.sources.length} sources${view.passes > 1 ? " · pass 2" : ""}`;
  if (agent === "analyst") return status === "active" ? "Cross-checking…" : `${view.findings.length} findings`;
  if (agent === "insight") return status === "active" ? "Reasoning…" : `${view.insights.length} hypotheses`;
  return status === "active" ? "Writing…" : "Report ready";
}

export function AgentGraph({ view }: { view: ResearchViewState }) {
  const nodes: Array<AgentNode | SpacerNodeType> = useMemo(
    () => [
      ...AGENTS.map((a, i): AgentNode => ({
        id: a.id,
        type: "agent",
        position: { x: 0, y: i * Y_GAP },
        data: { agent: a.id, status: view.agents[a.id], detail: detailFor(a.id, view) },
        draggable: false,
        selectable: false,
      })),
      { id: "spacer", type: "spacer", position: { x: 262, y: Y_GAP / 2 }, data: {}, draggable: false, selectable: false },
    ],
    [view],
  );

  const edges: Edge[] = useMemo(() => {
    const last = view.handoffs[view.handoffs.length - 1];
    const stateOf = (from: AgentId, to: AgentId): "idle" | "active" | "done" => {
      const happened = view.handoffs.some((h) => h.from === from && h.to === to);
      if (!happened) return "idle";
      return last?.from === from && last?.to === to && view.activeAgent === to ? "active" : "done";
    };
    const chain: Array<[AgentId, AgentId]> = [
      ["retriever", "analyst"],
      ["analyst", "insight"],
      ["insight", "reporter"],
    ];
    return [
      ...chain.map(([from, to]) => ({
        id: `${from}-${to}`,
        source: from,
        target: to,
        sourceHandle: "out",
        targetHandle: "in",
        ...edgeStyle(stateOf(from, to)),
      })),
      {
        id: "loop",
        source: "analyst",
        target: "retriever",
        sourceHandle: "loop-out",
        targetHandle: "loop-in",
        type: "smoothstep",
        pathOptions: { offset: 22, borderRadius: 10 },
        label: "gaps",
        labelStyle: { fontSize: 10.5, fill: view.passes > 1 ? "var(--accent)" : "var(--subtle)" },
        labelBgStyle: { fill: "var(--surface)" },
        ...edgeStyle(stateOf("analyst", "retriever")),
        style: { ...edgeStyle(stateOf("analyst", "retriever")).style, strokeDasharray: view.passes > 1 ? undefined : "4 4" },
      },
    ];
  }, [view.handoffs, view.activeAgent, view.passes]);

  return (
    <div className="h-[400px] w-full" aria-label="Agent graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}
