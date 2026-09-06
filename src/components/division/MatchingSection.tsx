"use client";

import { useActionState } from "react";
import type { SetupMatchView } from "@/features/division/single-elimination/view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { MatchingEditor } from "./MatchingEditor";

/**
 * 生成ボタンと D&D エディタのサーバ配線。MatchingEditor を
 * onSwap だけを見る形に保つため、Server Action の呼び出しはここに寄せる。
 */
export function MatchingSection({
  matches,
  slug,
  tournamentId,
  divisionId,
  generateAction,
  swapAction,
  disabled,
}: {
  matches: SetupMatchView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  generateAction: DivisionFormAction;
  swapAction: DivisionFormAction;
  disabled: boolean;
}) {
  const [swapState, swapFormAction, swapPending] = useActionState(
    swapAction,
    INITIAL_DIVISION_FORM_STATE,
  );

  const handleSwap = (indexA: number, indexB: number): void => {
    // useActionState が返す関数は FormData をそのまま受け取れる。
    // D&D にはフォームの submit が無いので、ここで組み立てて渡す。
    const data = new FormData();
    data.set("slug", slug);
    data.set("tournamentId", tournamentId);
    data.set("divisionId", divisionId);
    data.set("indexA", String(indexA));
    data.set("indexB", String(indexB));
    swapFormAction(data);
  };

  return (
    <div className="space-y-3">
      <GenerateMatchingForm
        slug={slug}
        tournamentId={tournamentId}
        divisionId={divisionId}
        action={generateAction}
        disabled={disabled}
        label="組み合わせを生成"
      />

      {swapState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {swapState.error}
        </p>
      )}

      <MatchingEditor
        matches={matches}
        onSwap={handleSwap}
        disabled={disabled || swapPending}
      />
    </div>
  );
}
