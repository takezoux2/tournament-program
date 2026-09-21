"use client";

import {
  Background,
  Controls,
  type Edge,
  ReactFlow,
  type ReactFlowState,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import type { BracketFlowNode } from "@/features/bracket/to-flow-elements";
import { MatchNode } from "./MatchNode";
import { SectionNode } from "./SectionNode";

const nodeTypes = { match: MatchNode, section: SectionNode };

/**
 * ストアが保持していて、かつ寸法を計測済みのノードの id 列。
 * nodes プロップはエフェクトでストアへ同期されるため、プロップが変わった直後の
 * 描画ではストアはまだ古いノードを持っている（useNodesInitialized も古いノードの
 * 計測結果で true のまま）。プロップ側の signature とこれが一致した時点で初めて、
 * 新しいノードがすべて計測済みだと言える。
 */
const measuredSignature = (state: ReactFlowState): string =>
  state.nodes
    .filter((node) => {
      const measured = state.nodeLookup.get(node.id)?.measured;
      return (measured?.width ?? 0) > 0 && (measured?.height ?? 0) > 0;
    })
    .map((node) => node.id)
    .join(",");

// `fitView` プロップはマウント時にしか効かないため、試合の追加・削除でノード構成が
// 変わったら、新しいノードがストアに入り計測されるのを待って再フィットする。
// 選手の割り当て・解除（ノード id が同じ）では再フィットしない。
// 計測は jsdom では起きないので、この部品は単体テストしない。
function FitViewOnStructureChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  const measured = useStore(measuredSignature);
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (measured !== signature || fitted.current === signature) return;
    fitted.current = signature;
    void fitView({ padding: 0.15 });
  }, [measured, signature, fitView]);
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
