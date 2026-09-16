import type { DivisionFormat } from "@/generated/prisma/enums";
import type {
  BracketMatch,
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "./types";

/** スロット 1 つの表示文字列を作る関数。 */
export type SlotLabeler = (slot: SlotSource) => string;

/**
 * スロットの表示文字列を作る関数を返す。
 *
 * 部門の試合番号一覧（features/division）と大会の試合一覧（features/schedule）が
 * 同じ文言を出す必要がある。features は同列どうし依存できないため、
 * 両方から参照できる下位共通層のここへ置く。
 *
 * 名前を引けなかった entry は「（不明な参加者）」にして落とさない。
 * 参加者一覧が古いだけでも一覧は読めた方がよい。bye と書き分けるのは、
 * 引けないだけのスロットを「不戦勝」と出すとブラケットの読み違いになるため。
 */
export const createSlotLabeler = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): SlotLabeler => {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      participantById.get(entry.participantId) ?? null,
    ]),
  );
  const numberByMatchId = new Map(
    config.matches.map((match) => [match.id, match.matchNumber]),
  );

  return (slot) => {
    switch (slot.kind) {
      case "entry":
        return nameByEntryId.get(slot.entryId) ?? "（不明な参加者）";
      case "winnerOf":
        return `第${numberByMatchId.get(slot.matchId) ?? "?"}試合の勝者`;
      case "loserOf":
        return `第${numberByMatchId.get(slot.matchId) ?? "?"}試合の敗者`;
      case "bye":
        return "BYE";
    }
  };
};

/** 「山田 vs 第3試合の勝者」のような対戦の表示。 */
export const matchCardLabel = (
  match: BracketMatch,
  labelSlot: SlotLabeler,
): string => `${labelSlot(match.slots[0])} vs ${labelSlot(match.slots[1])}`;

/**
 * 「1回戦 第1試合」のような構造上の位置。
 * リーグには節も回戦も無いので、実施順の通し番号だけで表す。
 * ダブルエリミでは勝者側・敗者側・決勝でそれぞれ異なるラベルを出す。
 * 形式を引数に取るのは、この関数が大会の進行順（複数の部門が混ざる）でも
 * 使われるため。呼び出し側がその試合の部門の形式を知っている。
 */
export const matchPositionLabel = (
  match: BracketMatch,
  format: DivisionFormat,
): string => {
  if (format === "ROUND_ROBIN") {
    return `第${match.sequence + 1}試合`;
  }
  if (format === "SINGLE_ELIMINATION") {
    return `${match.round}回戦 第${match.order + 1}試合`;
  }
  // ダブルエリミの round は全ブラケット通しの番号（敗者側 L は L + 1）。
  switch (match.bracket) {
    case "winners":
      return `勝者側${match.round}回戦 第${match.order + 1}試合`;
    case "losers":
      return `敗者側${match.round - 1}回戦 第${match.order + 1}試合`;
    case "final":
      return "決勝";
  }
};
