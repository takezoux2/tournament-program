"use client";

import type { MatchNameRowView } from "@/features/division/match-name-view";
import type { DivisionFormAction } from "@/features/division/state";
import { MatchNameRow } from "./MatchNameRow";

/**
 * 部門の試合を並べた、試合名の編集一覧。1 行が 1 つの編集フォーム。
 *
 * 並べ替えの操作は持たない。試合番号は大会の進行順（/matches）の通し番号
 * {{OverallSeq}} だけで決まり、部門の中で順番を持つ意味が無くなったため。
 * 行の並びは渡された配列の順（parseMatchingConfig が揃えた順）のまま。
 *
 * トーナメントとリーグで同じ部品を使う。違いは行の中身（位置の文言）だけで、
 * それは toMatchOrderView が format を見て吸収する。
 *
 * フックを持たないが "use client" を残すのは、Server Component（DivisionSetup /
 * LeagueSetup）とクライアント部品（MatchNameRow）の境界をこれまでと同じ位置に
 * 保つため。
 */
export function MatchOrderList({
  rows,
  slug,
  tournamentId,
  divisionId,
  setMatchNameAction,
  emptyMessage,
}: {
  /** この並びがそのまま画面の並びになる。 */
  rows: MatchNameRowView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  setMatchNameAction: DivisionFormAction;
  /** 行が 1 つも無いときの文言。画面ごとに言い方が違う。 */
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        組み合わせを作り直したときと、トーナメントで 1
        回戦の組み合わせを入れ替えたときは、試合名が既定に戻ります
      </p>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.matchId}
            className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3"
          >
            <MatchNameRow
              row={row}
              slug={slug}
              tournamentId={tournamentId}
              divisionId={divisionId}
              action={setMatchNameAction}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
