"use client";

import { useActionState } from "react";
import {
  DIVISION_FORMAT_LABELS,
  DIVISION_FORMATS,
} from "@/features/division/format";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { DivisionFormat } from "@/generated/prisma/enums";

export function DivisionForm({
  action,
  slug,
  tournamentId,
  submitLabel,
  defaultName = "",
  defaultFormat = "SINGLE_ELIMINATION",
  divisionId,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  submitLabel: string;
  defaultName?: string;
  defaultFormat?: DivisionFormat;
  /** 編集時に渡す。どの部門を更新するかを handler へ伝える。 */
  divisionId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {divisionId !== undefined && (
        <input type="hidden" name="divisionId" value={divisionId} />
      )}

      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          部門名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="format"
          className="block text-sm font-medium text-slate-700"
        >
          試合形式
        </label>
        <select
          id="format"
          name="format"
          required
          defaultValue={defaultFormat}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {DIVISION_FORMATS.map((format) => (
            <option key={format} value={format}>
              {DIVISION_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          ブラケット表示に対応しているのはシングルエリミネーションのみ
        </p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : submitLabel}
      </button>
    </form>
  );
}
