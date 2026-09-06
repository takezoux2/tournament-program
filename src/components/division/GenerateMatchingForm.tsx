"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 組み合わせの生成ボタンと、その結果の表示。
 * トーナメントとリーグで文言だけが違うので label を受け取る。
 */
export function GenerateMatchingForm({
  slug,
  tournamentId,
  divisionId,
  action,
  disabled,
  label,
}: {
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
  disabled: boolean;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          {pending ? "生成中..." : label}
        </button>
      </form>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== undefined && (
        <output className="text-sm text-slate-600">{state.notice}</output>
      )}
    </div>
  );
}
