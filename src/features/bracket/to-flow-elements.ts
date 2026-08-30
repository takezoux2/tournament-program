import type { Edge, Node } from "@xyflow/react";
import type { Position } from "./layout-bracket";
import type { ResolvedMatch } from "./types";

export type MatchNodeData = { match: ResolvedMatch };
export type MatchFlowNode = Node<MatchNodeData, "match">;

const DECIDED_STROKE = "#475569";
const UNDECIDED_STROKE = "#cbd5e1";

/** ResolvedMatch[] と座標表を React Flow の nodes / edges へ変換する。 */
export function toFlowElements(
  matches: ResolvedMatch[],
  positions: Map<string, Position>,
): { nodes: MatchFlowNode[]; edges: Edge[] } {
  const decidedMatchIds = new Set(
    matches.filter((match) => match.winnerId !== null).map((match) => match.id),
  );

  const nodes: MatchFlowNode[] = matches.map((match) => {
    const position = positions.get(match.id);
    if (!position) {
      throw new Error(`No position for match "${match.id}"`);
    }
    return {
      id: match.id,
      type: "match",
      position,
      data: { match },
      draggable: false,
    };
  });

  const edges: Edge[] = matches.flatMap((match) =>
    match.sourceMatchIds
      .filter((id): id is string => id !== null)
      .map((sourceId) => ({
        id: `${sourceId}->${match.id}`,
        source: sourceId,
        target: match.id,
        style: {
          strokeWidth: 2,
          stroke: decidedMatchIds.has(sourceId)
            ? DECIDED_STROKE
            : UNDECIDED_STROKE,
        },
      })),
  );

  return { nodes, edges };
}
