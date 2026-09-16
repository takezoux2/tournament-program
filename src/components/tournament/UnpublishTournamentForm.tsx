"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function UnpublishTournamentForm({
  action,
  slug,
  tournamentId,
  tournamentName,
}: {
  action: TournamentFormAction;
  slug: string;
  tournamentId: string;
  tournamentName: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-800">公開設定</h2>
      <p className="text-xs text-slate-600">
        この大会は公開中です。非公開にすると公開ページは組織のメンバーにしか表示されません。
      </p>
      <ConfirmDialog
        triggerLabel="非公開にする"
        title="大会を非公開にする"
        message={`「${tournamentName}」を非公開にしますか？参加者は公開ページを閲覧できなくなります。`}
        confirmLabel="非公開にする"
        pendingLabel="処理中..."
        formAction={formAction}
        pending={pending}
        error={state.error}
        hiddenFields={{ slug, tournamentId }}
      />
    </section>
  );
}
