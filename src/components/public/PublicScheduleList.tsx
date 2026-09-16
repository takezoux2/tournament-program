import { MatchNoteButton } from "@/components/result/MatchNoteButton";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { formatStartsAt } from "@/features/tournament/format";
import { aggregateScore, formatScore } from "@/lib/division/score";

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

/**
 * 結果の 1 行ぶんの文言。記録が無い試合では何も返さない。
 *
 * 引き分けは ROUND_ROBIN 専用で、ブラケット（MatchCard）は扱えず結果ごと捨てる。
 * 引き分けが公開側に出るのはこの一覧だけになる。
 */
const resultParts = (row: MatchRow): string[] => {
  if (row.state !== "recorded") {
    return [];
  }

  const winner =
    row.winnerEntryId === null
      ? "引き分け"
      : `${row.slots.find((slot) => slot.entryId === row.winnerEntryId)?.label ?? ""}の勝ち`;

  const scores = row.slots
    .map((slot) =>
      slot.entryId === null
        ? null
        : formatScore(
            aggregateScore(
              row.scores.find((entry) => entry.entryId === slot.entryId)
                ?.values ?? [],
              row.resultConfig.score.aggregation,
            ),
          ),
    )
    .filter((value): value is string => value !== null);

  return [
    winner,
    row.resultConfig.winReason.enabled ? row.winReason : null,
    row.resultConfig.score.enabled && scores.length === 2
      ? scores.join(" - ")
      : null,
  ].filter((value): value is string => value !== null);
};

/**
 * 公開ページの試合一覧。既存の ScheduleList は dnd と Server Action を前提にした
 * クライアントコンポーネントなので流用せず、読むだけの Server Component として
 * 書き直す。行の並びは渡された順（loadResultRows が進行順に整えたもの）。
 *
 * 対戦カードは truncate せず折り返す。狭い画面で切ると「山田 vs …」となり、
 * 一覧としての用を成さなくなる。
 */
export function PublicScheduleList({ rows }: { rows: ResultRowView[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        if (row.kind === "divider") {
          return (
            <li
              key={row.key}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-300 pt-3 pb-1"
            >
              <span className="font-bold text-slate-700">{row.label}</span>
              {/*
                formatStartsAt は null に「未設定」を返す。区切りの時刻は
                任意項目なので、未設定のときは何も出さない方が読みやすい。
              */}
              {row.startsAt !== null && (
                <span className="text-xs text-slate-500">
                  {formatStartsAt(row.startsAt)}
                </span>
              )}
            </li>
          );
        }

        const parts = resultParts(row);

        return (
          <li
            key={row.key}
            className="rounded border border-slate-200 bg-white px-4 py-3"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-800">
              <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
                第{row.matchNumber}試合
              </span>
              <span className="min-w-0 wrap-break-word font-medium">
                {`${row.slots[0].label} vs ${row.slots[1].label}`}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {row.divisionName} / {row.label}
            </p>
            {parts.length > 0 && (
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-700">
                {parts.join(" ・ ")}
                {row.resultConfig.note.enabled && (
                  <MatchNoteButton
                    note={row.note}
                    label={`第${row.matchNumber}試合のメモ`}
                  />
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
