import { LeagueResultTable } from "@/components/division/LeagueResultTable";
import { Notice } from "@/components/division/Notice";
import { prepareBracket } from "@/components/division/prepare-bracket";
import { prepareLeagueTable } from "@/components/division/prepare-league-table";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { PrintBracket } from "./PrintBracket";

type BodyProps = {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  overallSeq: ReadonlyMap<string, number>;
  withResults: boolean;
};

const BracketBody = ({
  division,
  participants,
  overallSeq,
  withResults,
}: BodyProps) => {
  const prepared = prepareBracket(division, participants, overallSeq, {
    withResults,
    withPlayerNumber: true,
  });
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }
  // SVG は親の高さに合わせて縮む。画面では 70vh、印刷では printPageCss が
  // .print-division-body に用紙から求めた高さを与え、1 ページに収める。
  return (
    <div className="print-division-body h-[70vh]">
      <PrintBracket
        matches={prepared.matches}
        positions={prepared.positions}
        labels={prepared.labels}
      />
    </div>
  );
};

const LeagueBody = ({
  division,
  participants,
  overallSeq,
  withResults,
}: BodyProps) => {
  const prepared = prepareLeagueTable(division, participants, overallSeq, {
    withResults,
  });
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }
  return (
    <LeagueResultTable
      table={prepared.table}
      print
      showStandings={withResults}
    />
  );
};

/** 印刷の部門 1 つ。形式でトーナメント表とリーグ表を描き分ける。 */
export function PrintDivisionSection(props: BodyProps) {
  const { division } = props;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">
        {division.name}
        <span className="ml-3 text-sm font-normal text-slate-600">
          {DIVISION_FORMAT_LABELS[division.format]}
        </span>
      </h2>
      {(() => {
        switch (division.format) {
          case "SINGLE_ELIMINATION":
          case "DOUBLE_ELIMINATION_GRAND_FINAL":
          case "DOUBLE_ELIMINATION_THIRD_PLACE":
            return <BracketBody {...props} />;
          case "ROUND_ROBIN":
            return <LeagueBody {...props} />;
          default: {
            // 形式を増やしたときに、何も描かないまま通るのではなくコンパイルエラーにする
            const exhaustive: never = division.format;
            return exhaustive;
          }
        }
      })()}
    </section>
  );
}
