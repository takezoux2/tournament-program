"use client";

import { Background, Controls, type Edge, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BracketFlowNode } from "@/features/bracket/to-flow-elements";
import { MatchNode } from "./MatchNode";
import { SectionNode } from "./SectionNode";

const nodeTypes = { match: MatchNode, section: SectionNode };

export function TournamentFlow({
  nodes,
  edges,
}: {
  nodes: BracketFlowNode[];
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
