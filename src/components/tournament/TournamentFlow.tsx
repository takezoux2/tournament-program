"use client";

import { Background, Controls, type Edge, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { MatchFlowNode } from "@/features/tournament/to-flow-elements";
import { MatchNode } from "./MatchNode";

const nodeTypes = { match: MatchNode };

export function TournamentFlow({
  nodes,
  edges,
}: {
  nodes: MatchFlowNode[];
  edges: Edge[];
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
