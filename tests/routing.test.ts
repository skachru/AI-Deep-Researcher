import { describe, expect, it } from "vitest";
import { importantGaps, routeAfterAnalysis } from "@/lib/graph/routing";
import type { Gap } from "@/lib/schemas/domain";

const high: Gap = { description: "No RCTs after 2024", importance: "high", followUpQuestion: "Any 2025 RCTs?" };
const low: Gap = { description: "Minor", importance: "low", followUpQuestion: "Something" };

describe("routeAfterAnalysis", () => {
  it("loops back to the retriever on the first pass when an important gap exists", () => {
    expect(routeAfterAnalysis({ gaps: [high], iteration: 0, depth: "standard" })).toBe("retriever");
  });

  it("continues to insight generation when there are no important gaps", () => {
    expect(routeAfterAnalysis({ gaps: [low], iteration: 0, depth: "standard" })).toBe("insight");
    expect(routeAfterAnalysis({ gaps: [], iteration: 0, depth: "standard" })).toBe("insight");
  });

  it("never loops in Quick depth (latency first)", () => {
    expect(routeAfterAnalysis({ gaps: [high], iteration: 0, depth: "quick" })).toBe("insight");
  });

  it("never loops more than once (max two retrieval passes)", () => {
    expect(routeAfterAnalysis({ gaps: [high], iteration: 1, depth: "standard" })).toBe("insight");
    expect(routeAfterAnalysis({ gaps: [high], iteration: 5, depth: "standard" })).toBe("insight");
  });

  it("ignores high-importance gaps without a usable follow-up question", () => {
    expect(importantGaps([{ ...high, followUpQuestion: "  " }])).toHaveLength(0);
    expect(routeAfterAnalysis({ gaps: [{ ...high, followUpQuestion: "" }], iteration: 0, depth: "standard" })).toBe(
      "insight",
    );
  });
});
