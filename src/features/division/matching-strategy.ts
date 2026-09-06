import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionEntry, MatchingConfig } from "@/lib/division/types";
import { buildRoundRobin } from "./round-robin/build";
import { buildFromSlots, toSlots } from "./single-elimination/build";
import { generateSlots, placeEntry } from "./single-elimination/edit";

/**
 * エントリー・組み合わせの編集画面を持つ形式。setup-store の読み出しが
 * これで弾くため、ここに無い形式へは Server Action からも書き込めない。
 */
export const EDITABLE_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
] as const satisfies readonly DivisionFormat[];

export type EditableFormat = (typeof EDITABLE_FORMATS)[number];

export const isEditableFormat = (
  format: DivisionFormat,
): format is EditableFormat =>
  (EDITABLE_FORMATS as readonly DivisionFormat[]).includes(format);

/**
 * 部門あたりのエントリー上限。
 *
 * リーグは試合数が n(n-1)/2 で増えるため、トーナメントと同じ 128 人だと
 * 8128 試合の Json と一覧が生まれる。1 つのリーグとして現実に回せる
 * 人数で切り、それ以上は部門を分けて並行リーグにする運用に倒す。
 *
 * Record のキーを EditableFormat に固定しているので、対応形式を足して
 * 上限を書き忘れるとコンパイルエラーになる。
 */
const MAX_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 128,
  ROUND_ROBIN: 16,
};

export const maxEntries = (format: EditableFormat): number =>
  MAX_ENTRIES[format];

/**
 * エントリーのシード順から組み合わせを丸ごと作り直す。
 * 2 人未満ならどちらの形式でも空を返す。
 */
export const regenerateMatching = (
  format: EditableFormat,
  entries: DivisionEntry[],
): MatchingConfig => {
  switch (format) {
    case "SINGLE_ELIMINATION":
      return buildFromSlots(generateSlots(entries));
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
  }
};

/**
 * エントリーを 1 人足したあとの組み合わせ。
 *
 * トーナメントは「一番下の bye を埋める」だけで既存の対戦カードが残る。
 * リーグには対応する操作が無い（1 人増えれば全員の試合が 1 つずつ増え、
 * 円卓法の割り当ても全部ずれる）ので丸ごと作り直す。
 *
 * 組み合わせが未作成のときは空のままにする。エントリーを足しただけで
 * 対戦表が生えると、生成を押していない運営者を驚かせる。
 */
export const applyEntryAdded = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntry[],
  addedEntryId: string,
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
      return buildFromSlots(placeEntry(toSlots(current), addedEntryId));
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
  }
};

/**
 * シード順を入れ替えたあとの組み合わせ。
 *
 * トーナメントは触らない（反映したければ運営者が「生成」を押す）。
 * リーグの割り当てはシード順から決まるので、触らないと画面の
 * 「エントリー」と「対戦表」が食い違ったままになる。作り直す。
 */
export const applyEntryReordered = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntry[],
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
      return current;
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
  }
};
