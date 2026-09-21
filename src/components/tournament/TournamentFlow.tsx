"use client";

import {
  Background,
  Controls,
  type Edge,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import type { BracketFlowNode } from "@/features/bracket/to-flow-elements";
import { MatchNode } from "./MatchNode";
import { SectionNode } from "./SectionNode";

const nodeTypes = { match: MatchNode, section: SectionNode };

// `fitView` プロップはマウント時にしか効かないため、試合の追加・削除でノード構成が
// 変わったら計測完了を待って再フィットする。選手の割り当て・解除（ノード id が同じ）
// では再フィットしない。計測は jsdom では起きないので、この部品は単体テストしない。
function FitViewOnStructureChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || fitted.current === signature) return;
    fitted.current = signature;
    void fitView({ padding: 0.15 });
  }, [initialized, signature, fitView]);
  return null;
}

export function TournamentFlow({
  nodes,
  edges,
}: {
  nodes: BracketFlowNode[];
  edges: Edge[];
}) {
  const signature = useMemo(() => nodes.map((n) => n.id).join(","), [nodes]);
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
      <FitViewOnStructureChange signature={signature} />
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
