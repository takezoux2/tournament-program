import type { DivisionFormat } from "@/generated/prisma/enums";
import type { BracketMatch, DivisionEntries, SlotSource } from "./types";

/** スロット 1 つの表示文字列を作る関数。 */
export type SlotLabeler = (slot: SlotSource) => string;

/**
 * スロットの表示文字列を作る関数を返す。
 *
 * 部門の試合名一覧（features/division）と大会の試合一覧（features/schedule）が
 * 同じ文言を出す必要がある。features は同列どうし依存できないため、
 * 両方から参照できる下位共通層のここへ置く。
 *
 * 第 1 引数が展開済みの試合名の表なのは、{{OverallSeq}} が大会全体を
 * 見ないと決まらないため。この関数は部門しか知らないので自分では展開できない。
 * 「第◯試合」の飾りを付けないのも同じ理由で、名前の形は試合名そのものが
 * 決める（既定値なら「第1試合の勝者」になる）。
 *
 * 名前を引けなかった entry は「（不明な参加者）」にして落とさない。
 * 参加者一覧が古いだけでも一覧は読めた方がよい。bye と書き分けるのは、
 * 引けないだけのスロットを「不戦勝」と出すとブラケットの読み違いになるため。
 */
export const createSlotLabeler = (
  matchNames: ReadonlyMap<string, string>,
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

  return (slot) => {
    switch (slot.kind) {
      case "entry":
        return nameByEntryId.get(slot.entryId) ?? "（不明な参加者）";
      case "winnerOf":
        return `${matchNames.get(slot.matchId) ?? "?"}の勝者`;
      case "loserOf":
        return `${matchNames.get(slot.matchId) ?? "?"}の敗者`;
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
 * 「1回戦 (1)」のような構造上の位置。
 *
 * 「第 N 試合」と書かないのは、試合名の既定値（第{{OverallSeq}}試合）と同じ形に
 * なり、大会の通し番号と取り違えるため。括弧の数字はラウンド内の上からの位置
 * （order + 1）で、試合の番号ではない。
 *
 * リーグは節も回戦も持たないので位置の文言を出さない（空文字）。表示側は
 * formatDivisionPosition を通して、空文字なら区切りごと描かない。
 *
 * ダブルエリミは勝者側・敗者側・決勝を書き分ける（「勝者側2回戦 (1)」
 * 「敗者側1回戦 (2)」「決勝」）。
 *
 * 形式を引数に取るのは、この関数が大会の進行順（複数の部門が混ざる）でも
 * 使われるため。呼び出し側がその試合の部門の形式を知っている。
 */
export const matchPositionLabel = (
  match: BracketMatch,
  format: DivisionFormat,
): string => {
  if (format === "ROUND_ROBIN") {
    return "";
  }
  if (format === "SINGLE_ELIMINATION") {
    return `${match.round}回戦 (${match.order + 1})`;
  }
  // ダブルエリミの round は全ブラケット通しの番号（敗者側 L は L + 1）。
  switch (match.bracket) {
    case "winners":
      return `勝者側${match.round}回戦 (${match.order + 1})`;
    case "losers":
      return `敗者側${match.round - 1}回戦 (${match.order + 1})`;
    case "final":
      return "決勝";
  }
};

/**
 * 「男子 / 1回戦 (1)」のような、部門名と位置を並べた 1 行。
 * 位置が空文字（リーグ）のときは部門名だけにして、「男子 / 」のように
 * 区切りだけが残るのを防ぐ。進行順・公開の進行順・結果入力の 3 画面が
 * 同じ見せ方をするため、ここに 1 つだけ置く。
 */
export const formatDivisionPosition = (
  divisionName: string,
  label: string,
): string => (label === "" ? divisionName : `${divisionName} / ${label}`);
