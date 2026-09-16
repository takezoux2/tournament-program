"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function PublishTournamentButton({
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
    <ConfirmDialog
      triggerLabel="公開する"
      triggerClassName="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white cursor-pointer"
      title="大会を公開"
      message={`「${tournamentName}」を公開しますか？公開すると参加者を含む誰でも公開ページを閲覧できるようになります。`}
      confirmLabel="公開する"
      pendingLabel="公開中..."
      formAction={formAction}
      pending={pending}
      error={state.error}
      hiddenFields={{ slug, tournamentId }}
    />
  );
}
