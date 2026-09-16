import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isRoundRobinShape } from "@/features/division/round-robin/build";
import { toLeagueTableView } from "@/features/division/round-robin/standings";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { DivisionBracket } from "./DivisionBracket";
import { LeagueResultTable } from "./LeagueResultTable";
import { Notice } from "./Notice";

/** リーグの結果表。Json のパースと形の検査をこの区画で受け止める。 */
const LeagueSection = ({
  division,
  participants,
  overallSeq,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  overallSeq: ReadonlyMap<string, number>;
}) => {
  // Json は DB の列で、アプリの外から壊れた値が入りうる。パースの失敗は
  // ここで受け止め、ページ全体は落とさない。
  let parsed: {
    entries: ReturnType<typeof parseDivisionEntries>;
    matchingConfig: ReturnType<typeof parseMatchingConfig>;
    results: ReturnType<typeof parseDivisionResults>;
  };
  try {
    parsed = {
      entries: parseDivisionEntries(division.entries),
      matchingConfig: parseMatchingConfig(division.matchingConfig),
      results: parseDivisionResults(division.results),
    };
  } catch {
    return <Notice>部門のデータを読み込めませんでした</Notice>;
  }

  if (parsed.matchingConfig.matches.length === 0) {
    return <Notice>組み合わせが未作成です</Notice>;
  }

  // /edit は format を無条件に書き換えられるので、トーナメントの木を
  // 持ったままリーグになった部門が存在しうる。その木を結果表として
  // 描くと嘘になるため、案内だけ出す（編集画面の LeagueSetup と同じ扱い）。
  if (!isRoundRobinShape(parsed.matchingConfig)) {
    return <Notice>この対戦表はリーグの形ではありません</Notice>;
  }

  return (
    <LeagueResultTable
      table={toLeagueTableView(
        parsed.matchingConfig,
        parsed.entries,
        parsed.results,
        participants,
        resolveMatchNames(parsed.matchingConfig, division.id, overallSeq),
      )}
    />
  );
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
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return (
        <Notice>
          「{DIVISION_FORMAT_LABELS[division.format]}
          」のブラケット表示はまだ対応していません
        </Notice>
      );
    default: {
      // 形式を増やしたときに、何も描かないまま通るのではなくコンパイルエラーにする
      const exhaustive: never = division.format;
      return exhaustive;
    }
  }
}
