import { fromDivision } from "@/features/bracket/from-division";
import {
  layoutBracket,
  type Position,
  type SectionLabel,
  sectionLabels,
} from "@/features/bracket/layout-bracket";
import { resolveBracket } from "@/features/bracket/resolve-bracket";
import type { ResolvedMatch } from "@/features/bracket/types";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResultConfigOrDefault,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { EMPTY_DIVISION_RESULTS } from "@/lib/division/types";

/** 描ける状態のブラケットか、代わりに出す 1 行の案内。 */
export type PreparedBracket =
  | {
      kind: "ready";
      matches: ResolvedMatch[];
      positions: Map<string, Position>;
      labels: SectionLabel[];
    }
  | { kind: "notice"; message: string };

export type PrepareBracketOptions = {
  /** false なら結果を無視して組み合わせだけを解決する（印刷の空欄モード） */
  withResults?: boolean;
  /** 表示名の前に選手番号を付ける。紙では選手番号で呼び出すため印刷で使う */
  withPlayerNumber?: boolean;
  /** 参照エントリーの表示名。entry-source.ts の entrySourceLabels で作って渡す */
  entryLabels?: ReadonlyMap<string, string>;
};

/**
 * 部門の Json をブラケットとして描ける形にする。画面（DivisionBracket）と
 * 印刷（PrintBracket）が同じ判定・同じ案内文を使うよう、描画の手前までを
 * ここに集める。失敗はすべて案内文で返し、例外は外へ出さない。
 */
export function prepareBracket(
  division: DivisionDetail,
  participants: DivisionParticipant[],
  overallSeq: ReadonlyMap<string, number>,
  options: PrepareBracketOptions = {},
): PreparedBracket {
  const { withResults = true, withPlayerNumber = false, entryLabels } = options;

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
    return {
      kind: "notice",
      message: "ブラケットのデータを読み込めませんでした",
    };
  }

  // resultConfig は表示のフィルタでしかない。壊れていてもブラケットそのものは
  // 描けるはずなので、他の 3 列とは別に受け止めて既定値へ落とす
  // （/edit ページの読み出しと同じ方針）。
  const resultConfig = parseDivisionResultConfigOrDefault(
    division.resultConfig,
  );

  if (parsed.matchingConfig.matches.length === 0) {
    return { kind: "notice", message: "組み合わせが未作成です" };
  }

  // リーグは星取表で描く（DivisionMatchingView）。ここへ来るのは誤用。
  if (division.format === "ROUND_ROBIN") {
    return {
      kind: "notice",
      message: `「${DIVISION_FORMAT_LABELS[division.format]}」のブラケット表示はまだ対応していません`,
    };
  }

  const converted = fromDivision({
    id: division.id,
    name: division.name,
    format: division.format,
    entries: parsed.entries,
    matchingConfig: parsed.matchingConfig,
    // 空欄モードでも BYE の勝ち上がりは resolveBracket が構造から決めるので残る
    results: withResults ? parsed.results : EMPTY_DIVISION_RESULTS,
    resultConfig,
    // memberId は setup 画面の候補絞り込み用で、ブラケットには要らない。
    // 公開ページではノードのデータがクライアントへ送られるため、
    // 描画に使う項目だけを渡して内部 id が紛れ込まないようにする。
    participants: participants.map(({ id, name, playerNumber, team }) => ({
      id,
      name: withPlayerNumber ? `No.${playerNumber} ${name}` : name,
      team,
    })),
    matchNames: resolveMatchNames(
      parsed.matchingConfig,
      division.id,
      overallSeq,
    ),
    // 仮名には選手番号を付けない（まだ誰でもないので番号が無い）
    entryLabels,
  });
  if (converted === null) {
    return {
      kind: "notice",
      message: "この組み合わせはまだ表示に対応していません",
    };
  }

  // resolveBracket / layoutBracket は矛盾したデータで例外を投げる設計。
  // ここも同じくページを落とさず案内で返す。
  try {
    const matches = resolveBracket(
      converted.participants,
      converted.bracket,
      converted.results,
    );
    const positions = layoutBracket(matches);
    return {
      kind: "ready",
      matches,
      positions,
      labels: sectionLabels(matches, positions),
    };
  } catch {
    return { kind: "notice", message: "ブラケットを組み立てられませんでした" };
  }
}
