"use client";

import { useActionState, useState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { aggregateScore, formatScore } from "@/lib/division/score";

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

/** スコア欄の値。空文字は未入力（null）を表す。 */
type ScoreDraft = Record<string, string[]>;

/** その試合に立っている 2 人。BYE と未確定のスロットは entryId を持たない。 */
const standingSlots = (row: MatchRow) =>
  row.slots.flatMap((slot) =>
    slot.entryId === null ? [] : [{ entryId: slot.entryId, label: slot.label }],
  );

const initialDraft = (row: MatchRow): ScoreDraft => {
  const count = row.resultConfig.score.count;
  const draft: ScoreDraft = {};
  for (const slot of standingSlots(row)) {
    const saved = row.scores.find((entry) => entry.entryId === slot.entryId);
    draft[slot.entryId] = Array.from({ length: count }, (_, index) => {
      const value = saved?.values[index];
      return value === undefined || value === null ? "" : String(value);
    });
  }
  return draft;
};

const toNumbers = (values: string[]): (number | null)[] =>
  values.map((value) => (value.trim() === "" ? null : Number(value)));

/**
 * 勝因・スコア・メモの入力。勝敗のフォームとは別の form にする。
 *
 * HTML のフォームは入れ子にできないので、MatchResultRow の中では勝敗フォームと
 * 兄弟として並べる。保存先の Server Action も別（update-result-detail）で、
 * あちらと違い下流の記録を消さない。
 */
export function MatchResultDetailForm({
  row,
  slug,
  tournamentId,
  action,
}: {
  row: MatchRow;
  slug: string;
  tournamentId: string;
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [draft, setDraft] = useState<ScoreDraft>(() => initialDraft(row));

  const config = row.resultConfig;
  const slots = standingSlots(row);

  // 設定から消されたあとも、その試合に入っている値は選べるようにしておく。
  // でないと勝因を変えずにスコアだけ直すことができなくなる。
  const staleWinReason =
    row.winReason !== null && !config.winReason.options.includes(row.winReason)
      ? row.winReason
      : null;

  const setScore = (entryId: string, index: number, value: string) => {
    setDraft((current) => {
      const values = [...(current[entryId] ?? [])];
      values[index] = value;
      return { ...current, [entryId]: values };
    });
  };

  return (
    <form
      action={formAction}
      className="mt-2 space-y-3 rounded border border-slate-200 bg-slate-50 px-3 py-3"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={row.divisionId} />
      <input type="hidden" name="matchId" value={row.matchId} />

      {config.winReason.enabled && (
        <div className="flex items-center gap-2">
          <label
            htmlFor={`winReason-${row.key}`}
            className="text-xs text-slate-500"
          >
            勝因
          </label>
          <select
            id={`winReason-${row.key}`}
            name="winReason"
            defaultValue={row.winReason ?? ""}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">（未設定）</option>
            {staleWinReason !== null && (
              <option value={staleWinReason}>
                （一覧にない）{staleWinReason}
              </option>
            )}
            {config.winReason.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}

      {config.score.enabled && slots.length > 0 && (
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-medium text-slate-500">
                スコア
              </th>
              {Array.from({ length: config.score.count }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 欄の数は設定で決まり、並べ替えも削除もされないので index を鍵にしてよい
                <th key={index} className="px-1 py-1 font-medium text-slate-500">
                  {index + 1}
                </th>
              ))}
              <th className="px-2 py-1 font-medium text-slate-500">
                {config.score.aggregation === "sum" ? "合計" : "平均"}
              </th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.entryId}>
                <th
                  scope="row"
                  className="px-2 py-1 text-left font-medium text-slate-700"
                >
                  {slot.label}
                  {/* 欄名は score_<entryId>。サーバは getAll の順を index として読む。 */}
                  <input type="hidden" name="scoreEntryId" value={slot.entryId} />
                </th>
                {Array.from({ length: config.score.count }, (_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 欄の数は設定で決まり、並べ替えも削除もされないので index を鍵にしてよい
                  <td key={index} className="px-1 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="999.99"
                      name={`score_${slot.entryId}`}
                      aria-label={`${slot.label} のスコア ${index + 1}`}
                      value={draft[slot.entryId]?.[index] ?? ""}
                      onChange={(event) =>
                        setScore(slot.entryId, index, event.target.value)
                      }
                      className="w-16 rounded border border-slate-300 px-1 py-1 text-right"
                    />
                  </td>
                ))}
                <td
                  data-testid={`aggregate-${slot.entryId}`}
                  className="px-2 py-1 text-right font-medium text-slate-700"
                >
                  {formatScore(
                    aggregateScore(
                      toNumbers(draft[slot.entryId] ?? []),
                      config.score.aggregation,
                    ),
                  ) ?? "--"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {config.note.enabled && (
        <div className="flex items-center gap-2">
          <label htmlFor={`note-${row.key}`} className="text-xs text-slate-500">
            メモ
          </label>
          <input
            id={`note-${row.key}`}
            name="note"
            type="text"
            defaultValue={row.note ?? ""}
            maxLength={1000}
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {state.error !== null && (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
