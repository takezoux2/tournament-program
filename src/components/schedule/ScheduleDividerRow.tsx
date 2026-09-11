"use client";

import { useActionState } from "react";
import {
  INITIAL_SCHEDULE_FORM_STATE,
  type ScheduleFormAction,
} from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";

type DividerRow = Extract<ScheduleRowView, { kind: "divider" }>;

/**
 * 区切りの見出しと開始予定時刻をその場で編集する。1 行 1 フォームにして
 * useActionState を行ごとに持たせ、エラーをその行の隣に出す
 * （components/division/MatchNameRow.tsx と同じ形）。
 */
export function ScheduleDividerRow({
  row,
  name,
  slug,
  tournamentId,
  updateAction,
  removeAction,
}: {
  row: DividerRow;
  /**
   * この行の呼び名。操作の名前に差し込んで他の行と区別できるようにする。
   * 見出しは既定のまま複数置けるので、一意性は呼び出し側（ScheduleList）が持つ。
   */
  name: string;
  slug: string;
  tournamentId: string;
  updateAction: ScheduleFormAction;
  removeAction: ScheduleFormAction;
}) {
  const [updateState, update, updating] = useActionState(
    updateAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );
  const [removeState, remove, removing] = useActionState(
    removeAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="text-xs text-slate-400">
          -----
        </span>

        <form action={update} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="itemId" value={row.id} />
          <input
            type="text"
            name="label"
            defaultValue={row.label}
            aria-label={`${name}の見出し`}
            className="w-48 rounded border border-slate-300 px-2 py-1 text-sm font-bold"
          />
          {/*
            value はサーバで組み立てた文字列（startsAtInput）をそのまま使う。
            ここで Date から組み立てるとブラウザの時刻帯で書くことになり、
            受け取って new Date するサーバの時刻帯とずれる。
          */}
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={row.startsAtInput}
            aria-label={`${name}の開始予定時刻`}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={updating}
            aria-label={`${name}を保存`}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
          >
            保存
          </button>
        </form>

        <form action={remove}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="itemId" value={row.id} />
          <button
            type="submit"
            disabled={removing}
            aria-label={`${name}を削除`}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-red-600 disabled:opacity-30"
          >
            区切りを削除
          </button>
        </form>
      </div>

      {updateState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {updateState.error}
        </p>
      )}
      {removeState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {removeState.error}
        </p>
      )}
    </div>
  );
}
