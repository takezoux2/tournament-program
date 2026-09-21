import { toMatchOrderView } from "@/features/division/match-name-view";
import type { DivisionParticipant } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import type { DivisionFormat } from "@/generated/prisma/enums";
import { resolveMatchNames } from "@/lib/division/match-name";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import { MatchOrderList } from "./MatchOrderList";
import { Notice } from "./Notice";

/**
 * 試合名の区画。DivisionSetup と BracketEditorSetup の両方が同じ形
 * （見出し・mismatched 時の案内・MatchOrderList）を出す。空のときの文言と
 * setMatchNameAction だけが画面ごとに違うので、そこだけ props で受け取る。
 */
export function MatchNameSection({
  division,
  entries,
  matchingConfig,
  participants,
  overallSeq,
  slug,
  tournamentId,
  setMatchNameAction,
  mismatched,
  emptyMessage,
}: {
  division: { id: string; format: DivisionFormat };
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  participants: DivisionParticipant[];
  /** 大会全体の通し番号。{{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  slug: string;
  tournamentId: string;
  setMatchNameAction: DivisionFormAction;
  /** 保存済みの組み合わせがトーナメント（またはリーグ）の形をしていないか */
  mismatched: boolean;
  /** 行が 1 つも無いときの文言。画面ごとに言い方が違う */
  emptyMessage: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-slate-700">試合名</h2>
      {/* 試合名の変更は構造を変えないため、locked でも編集できる */}
      {mismatched ? (
        <Notice>組み合わせを作り直すと、ここに試合が出ます</Notice>
      ) : (
        <MatchOrderList
          rows={toMatchOrderView(
            matchingConfig,
            entries,
            participants,
            division.format,
            resolveMatchNames(matchingConfig, division.id, overallSeq),
          )}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          setMatchNameAction={setMatchNameAction}
          emptyMessage={emptyMessage}
        />
      )}
    </section>
  );
}
