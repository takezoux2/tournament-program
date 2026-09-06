"use client";

import type { LeagueRoundView } from "@/features/division/round-robin/view";
import type { DivisionFormAction } from "@/features/division/state";
import { MatchNumberRow } from "./MatchNumberRow";

/**
 * 節ごとの試合一覧。行は試合番号の編集フォームを兼ねる。
 *
 * 一覧と番号編集を 1 つの区画にまとめるのは、同じ試合が 2 区画に
 * 重複して並ぶのを避けるため。トーナメントの /setup が一覧と番号編集を
 * 分けているのは、あちらの一覧側が 1 回戦スロットの D&D で別物だからで、
 * リーグにはその区別が無い。
 */
export function LeagueRoundList({
  rounds,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  rounds: LeagueRoundView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
}) {
  if (rounds.length === 0) {
    return <p className="text-sm text-slate-600">まだ対戦表がありません</p>;
  }

  return (
    <div className="space-y-4">
      {rounds.map((round) => (
        <section key={round.round} className="space-y-2">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-bold text-slate-700">
              第{round.round}節
            </h3>
            {/* 休みは matchingConfig に保存しないので、出ていない人として算出する */}
            {round.restingLabels.length > 0 && (
              <p className="text-xs text-slate-500">
                休み: {round.restingLabels.join("、")}
              </p>
            )}
          </div>

          <ul className="space-y-2">
            {round.matches.map((row) => (
              <MatchNumberRow
                key={row.matchId}
                row={row}
                slug={slug}
                tournamentId={tournamentId}
                divisionId={divisionId}
                action={action}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
