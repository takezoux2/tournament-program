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

/** 「1回戦 第1試合」のような構造上の位置。 */
export const matchPositionLabel = (match: BracketMatch): string =>
  `${match.round}回戦 第${match.order + 1}試合`;
