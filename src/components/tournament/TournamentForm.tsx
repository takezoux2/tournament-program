"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";
import { TournamentDescriptionMarkdown } from "./TournamentDescriptionMarkdown";

export function TournamentForm({
  action,
  slug,
  submitLabel,
  defaultName = "",
  defaultStartsAt = "",
  defaultDescription = "",
  tournamentId,
}: {
  action: TournamentFormAction;
  slug: string;
  submitLabel: string;
  defaultName?: string;
  /** toDateTimeLocalValue で作った YYYY-MM-DDTHH:mm 形式の文字列。 */
  defaultStartsAt?: string;
  /** Markdown 形式の大会概要。 */
  defaultDescription?: string;
  /** 編集時に渡す。どの大会を更新するかを handler へ伝える。 */
  tournamentId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );
  const [description, setDescription] = useState(defaultDescription);
  const [descriptionTab, setDescriptionTab] = useState<"edit" | "preview">(
    "edit",
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {tournamentId !== undefined && (
        <input type="hidden" name="tournamentId" value={tournamentId} />
      )}

      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          大会名
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
          htmlFor="startsAt"
          className="block text-sm font-medium text-slate-700"
        >
          開始日時
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          defaultValue={defaultStartsAt}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">未定なら空のままでよい</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor="description"
            className="block text-sm font-medium text-slate-700"
          >
            大会概要
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDescriptionTab("edit")}
              className={`rounded px-2 py-1 text-xs ${
                descriptionTab === "edit"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600"
              }`}
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => setDescriptionTab("preview")}
              className={`rounded px-2 py-1 text-xs ${
                descriptionTab === "preview"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600"
              }`}
            >
              プレビュー
            </button>
          </div>
        </div>
        {/* プレビュー中も textarea を DOM に残して submit 値を保つ(hidden 切替)。 */}
        <textarea
          id="description"
          name="description"
          rows={8}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={`w-full rounded border border-slate-300 px-3 py-2 text-sm ${
            descriptionTab === "edit" ? "" : "hidden"
          }`}
        />
        {descriptionTab === "preview" &&
          (description.trim() === "" ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
              概要は未入力です
            </p>
          ) : (
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <TournamentDescriptionMarkdown markdown={description} />
            </div>
          ))}
        <p className="text-xs text-slate-500">Markdown で記述できる</p>
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
