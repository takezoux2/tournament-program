"use client";

import { useActionState } from "react";
import type { SetupMatchView } from "@/features/division/single-elimination/view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
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
  const [generateState, generateFormAction, generatePending] = useActionState(
    generateAction,
    INITIAL_DIVISION_FORM_STATE,
  );
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
      <form action={generateFormAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <button
          type="submit"
          disabled={generatePending || disabled}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          {generatePending ? "生成中..." : "組み合わせを生成"}
        </button>
      </form>

      {generateState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {generateState.error}
        </p>
      )}
      {generateState.notice !== undefined && (
        <output className="text-sm text-slate-600">
          {generateState.notice}
        </output>
      )}
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
