"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TournamentParticipant } from "@/features/participant/repository";
import {
  INITIAL_PARTICIPANT_FORM_STATE,
  type ParticipantFormAction,
} from "@/features/participant/state";

/**
 * 行ごとの削除。useActionState は 1 行に 1 つ要るため行のコンポーネントにする。
 * 出場部門がある行はボタンを無効にするが、これは体感のための出し分けで、
 * 拒否の境界は Server Action 側（remove/repository.ts の検査）にある。
 */
export function RemoveParticipantButton({
  slug,
  tournamentId,
  participant,
  action,
}: {
  slug: string;
  tournamentId: string;
  participant: TournamentParticipant;
  action: ParticipantFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PARTICIPANT_FORM_STATE,
  );

  const entered = participant.divisions.map((division) => division.name);

  if (entered.length > 0) {
    return (
      <button
        type="button"
        disabled
        title={`${entered.join("、")} にエントリー中のため削除できません`}
        className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-400"
      >
        削除
      </button>
    );
  }

  return (
    <ConfirmDialog
      triggerLabel="削除"
      title="参加者を削除"
      message={`「${participant.name}」を大会から削除しますか？組織のメンバーは残ります。`}
      confirmLabel="削除する"
      pendingLabel="削除中..."
      formAction={formAction}
      pending={pending}
      error={state.error}
      hiddenFields={{
        slug,
        tournamentId,
        participantId: participant.id,
      }}
      triggerClassName="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-700 cursor-pointer"
    />
  );
}
