import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { DivisionBracket } from "./DivisionBracket";
import { LeagueResultTable } from "./LeagueResultTable";
import { Notice } from "./Notice";
import { prepareLeagueTable } from "./prepare-league-table";

/** リーグの結果表。Json のパースと形の検査は prepareLeagueTable が受け止める。 */
const LeagueSection = ({
  division,
  participants,
  overallSeq,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  overallSeq: ReadonlyMap<string, number>;
}) => {
  const prepared = prepareLeagueTable(division, participants, overallSeq);
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }
  return <LeagueResultTable table={prepared.table} />;
};

/**
 * 部門の組み合わせを形式に応じて描く入口。部門詳細ページと公開ページが
 * 同じ props で呼ぶ。heightClassName はブラケットだけが使う（結果表は
 * 内容の高さに従う）。
 */
export function DivisionMatchingView({
  division,
  participants,
  overallSeq,
  heightClassName,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  /** 大会全体の通し番号。試合名の {{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  heightClassName?: string;
}) {
  switch (division.format) {
    case "SINGLE_ELIMINATION":
      return (
        <DivisionBracket
          division={division}
          participants={participants}
          overallSeq={overallSeq}
          heightClassName={heightClassName}
        />
      );
    case "ROUND_ROBIN":
      return (
        <LeagueSection
          division={division}
          participants={participants}
          overallSeq={overallSeq}
        />
      );
    default: {
      // 形式を増やしたときに、何も描かないまま通るのではなくコンパイルエラーにする
      const exhaustive: never = division.format;
      return exhaustive;
    }
  }
}
