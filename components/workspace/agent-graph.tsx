"use client";

import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
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
        "flex h-[58px] w-[208px] items-center gap-2.5 rounded-lg border bg-surface px-3 shadow-card transition-colors duration-200",
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

/** Fixed node size: lets React Flow show nodes immediately instead of waiting to measure them. */
const NODE_W = 208;
const NODE_H = 58;

export function AgentGraph({ view }: { view: ResearchViewState }) {
  // Only what the nodes display. Rebuilding nodes on every streamed token (the quick
  // summary emits dozens per second) kept React Flow re-measuring them, so they stayed hidden.
  const nodeData = JSON.stringify(AGENTS.map((a) => [view.agents[a.id], detailFor(a.id, view)]));

  const nodes: Array<AgentNode | SpacerNodeType> = useMemo(
    () => [
      ...AGENTS.map((a, i): AgentNode => {
        const [status, detail] = (JSON.parse(nodeData) as [AgentStatus, string][])[i];
        return {
          id: a.id,
          type: "agent",
          position: { x: 0, y: i * Y_GAP },
          width: NODE_W,
          height: NODE_H,
          data: { agent: a.id, status, detail },
          draggable: false,
          selectable: false,
        };
      }),
      {
        id: "spacer",
        type: "spacer",
        position: { x: 262, y: Y_GAP / 2 },
        width: 1,
        height: 1,
        data: {},
        draggable: false,
        selectable: false,
      },
    ],
    [nodeData],
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
        style: {
          ...edgeStyle(stateOf("analyst", "retriever")).style,
          strokeDasharray: view.passes > 1 ? undefined : "4 4",
        },
      },
    ];
  }, [view.handoffs, view.activeAgent, view.passes]);

  return (
    <ReactFlowProvider>
      <GraphCanvas nodes={nodes} edges={edges} />
    </ReactFlowProvider>
  );
}

const FIT = { padding: 0.12 } as const;

/**
 * React Flow only fits the view once, on mount. If the card is still being
 * laid out or animated in at that moment (width 0), the nodes end up off-screen
 * and the panel looks blank. Re-fit whenever the container resizes and once
 * the nodes have been measured.
 */
function GraphCanvas({ nodes, edges }: { nodes: Array<AgentNode | SpacerNodeType>; edges: Edge[] }) {
  const { fitView } = useReactFlow();
  const nodesReady = useNodesInitialized();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    let frame = 0;
    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0) void fitView(FIT);
      });
    };
    const observer = new ResizeObserver(refit);
    observer.observe(el);
    refit();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fitView]);

  useEffect(() => {
    if (nodesReady) void fitView(FIT);
  }, [nodesReady, fitView]);

  return (
    <div ref={wrapper} className="h-[400px] w-full" aria-label="Agent graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FIT}
        onInit={(instance) => void instance.fitView(FIT)}
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
