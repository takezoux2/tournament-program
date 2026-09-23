"use client";

import type { Edge } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import { SlotEditContext } from "@/components/tournament/slot-edit-context";
import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import type { BracketFlowNode } from "@/features/bracket/to-flow-elements";
import type { SlotSourceOption } from "@/features/division/slot-source-options";
import type { MemberSummary } from "@/features/organization/repository";
import {
  type SlotEditActions,
  SlotEditDialog,
  type SlotEditTarget,
} from "./SlotEditDialog";

export type BracketEditor = {
  locked: boolean;
  slug: string;
  tournamentId: string;
  divisionId: string;
  /** 選べるメンバー。この部門に配置済みの人は呼び出し側で除いておく */
  members: MemberSummary[];
  actions: SlotEditActions;
  /** 参照できる他部門。SlotEditDialog がモードの選択肢に使う */
  sourceOptions: SlotSourceOption[];
};

/**
 * 編集できるブラケット。鉛筆は MatchCard が context を見て出し、押されたら
 * ここがモーダルを開く。モーダルは React Flow の外に置く(ズーム・パンの
 * 変形を受けず、ノードの pointer-events 制御とも無関係にするため)。
 */
export function EditableBracket({
  nodes,
  edges,
  locked,
  slug,
  tournamentId,
  divisionId,
  members,
  actions,
  sourceOptions,
}: BracketEditor & { nodes: BracketFlowNode[]; edges: Edge[] }) {
  const [target, setTarget] = useState<SlotEditTarget | null>(null);

  const onEditSlot = useCallback(
    (matchId: string, slotIndex: 0 | 1) => {
      const node = nodes.find(
        (candidate) => candidate.type === "match" && candidate.id === matchId,
      );
      const match = node?.type === "match" ? node.data.match : undefined;
      setTarget({
        matchId,
        slotIndex,
        matchName: match?.matchName ?? null,
        occupantName: match?.slots[slotIndex].participant?.name ?? null,
      });
    },
    [nodes],
  );

  const context = useMemo(() => ({ locked, onEditSlot }), [locked, onEditSlot]);

  return (
    <SlotEditContext.Provider value={context}>
      <TournamentFlow nodes={nodes} edges={edges} />
      {target !== null && (
        <SlotEditDialog
          key={`${target.matchId}:${target.slotIndex}`}
          target={target}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={divisionId}
          members={members}
          actions={actions}
          onClose={() => setTarget(null)}
          sourceOptions={sourceOptions}
        />
      )}
    </SlotEditContext.Provider>
  );
}
