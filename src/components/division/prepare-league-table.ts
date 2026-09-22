import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isRoundRobinShape } from "@/features/division/round-robin/build";
import {
  type LeagueTableView,
  toLeagueTableView,
} from "@/features/division/round-robin/standings";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { EMPTY_DIVISION_RESULTS } from "@/lib/division/types";

/** 描ける状態のリーグ表か、代わりに出す 1 行の案内。 */
export type PreparedLeagueTable =
  | { kind: "ready"; table: LeagueTableView }
  | { kind: "notice"; message: string };

/**
 * 部門の Json をリーグの結果表にする。画面（DivisionMatchingView）と
 * 印刷（PrintDivisionSection）が同じ判定・同じ案内文を使う。
 */
export function prepareLeagueTable(
  division: DivisionDetail,
  participants: DivisionParticipant[],
  overallSeq: ReadonlyMap<string, number>,
  options: { withResults?: boolean } = {},
): PreparedLeagueTable {
  const { withResults = true } = options;

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
    return { kind: "notice", message: "部門のデータを読み込めませんでした" };
  }

  if (parsed.matchingConfig.matches.length === 0) {
    return { kind: "notice", message: "組み合わせが未作成です" };
  }

  // /edit は format を無条件に書き換えられるので、トーナメントの木を
  // 持ったままリーグになった部門が存在しうる。その木を結果表として
  // 描くと嘘になるため、案内だけ出す（編集画面の LeagueSetup と同じ扱い）。
  if (!isRoundRobinShape(parsed.matchingConfig)) {
    return { kind: "notice", message: "この対戦表はリーグの形ではありません" };
  }

  return {
    kind: "ready",
    table: toLeagueTableView(
      parsed.matchingConfig,
      parsed.entries,
      withResults ? parsed.results : EMPTY_DIVISION_RESULTS,
      participants,
      resolveMatchNames(parsed.matchingConfig, division.id, overallSeq),
    ),
  };
}
