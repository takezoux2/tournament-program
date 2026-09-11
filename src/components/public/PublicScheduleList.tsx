import type { ScheduleRowView } from "@/features/schedule/types";
import { formatStartsAt } from "@/features/tournament/format";

/**
 * 公開ページの試合一覧。既存の ScheduleList は dnd と Server Action を前提にした
 * クライアントコンポーネントなので流用せず、読むだけの Server Component として
 * 書き直す。行の並びは渡された順（loadScheduleView が進行順に整えたもの）。
 *
 * 対戦カードは truncate せず折り返す。狭い画面で切ると「山田 vs …」となり、
 * 一覧としての用を成さなくなる。
 */
export function PublicScheduleList({ rows }: { rows: ScheduleRowView[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) =>
        row.kind === "divider" ? (
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
        ) : (
          <li
            key={row.key}
            className="rounded border border-slate-200 bg-white px-4 py-3"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-800">
              <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
                {row.matchName}
              </span>
              <span className="min-w-0 wrap-break-word font-medium">
                {row.card}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {row.divisionName} / {row.label}
            </p>
          </li>
        ),
      )}
    </ul>
  );
}
