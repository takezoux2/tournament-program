import type { DivisionFormat } from "@/generated/prisma/enums";
import type {
  DivisionEntry,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import {
  buildDoubleElimination,
  type DoubleEliminationVariant,
  isDoubleEliminationShape,
} from "./double-elimination/build";
import { buildRoundRobin } from "./round-robin/build";
import {
  buildFromSlots,
  isSingleEliminationShape,
  toSlots,
} from "./single-elimination/build";
import { generateSlots, placeEntry } from "./single-elimination/edit";

/**
 * エントリー・組み合わせの編集画面を持つ形式。setup-store の読み出しが
 * これで弾くため、ここに無い形式へは Server Action からも書き込めない。
 */
export const EDITABLE_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
  "DOUBLE_ELIMINATION_GRAND_FINAL",
  "DOUBLE_ELIMINATION_THIRD_PLACE",
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
  // 敗者側を含めると試合数がおよそ 2 倍になる。1 部門として回せる規模で切る。
  DOUBLE_ELIMINATION_GRAND_FINAL: 64,
  DOUBLE_ELIMINATION_THIRD_PLACE: 64,
};

export const maxEntries = (format: EditableFormat): number =>
  MAX_ENTRIES[format];

/**
 * 組み合わせを作るのに必要なエントリー数。ダブルエリミは 2 人だと
 * 敗者側が作れない（buildDoubleElimination が空を返す）ので 3 人から。
 */
const MIN_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 2,
  ROUND_ROBIN: 2,
  DOUBLE_ELIMINATION_GRAND_FINAL: 3,
  DOUBLE_ELIMINATION_THIRD_PLACE: 3,
};

export const minEntries = (format: EditableFormat): number =>
  MIN_ENTRIES[format];

/**
 * 勝者側 1 回戦のスロット割当を唯一の情報源にする形式。
 * 1 回戦の入れ替え（swap-slots）と D&D エディタはこれらでだけ意味を持つ。
 */
export type SlotBracketFormat = Exclude<EditableFormat, "ROUND_ROBIN">;

export const isSlotBracketFormat = (
  format: DivisionFormat,
): format is SlotBracketFormat =>
  format === "SINGLE_ELIMINATION" ||
  format === "DOUBLE_ELIMINATION_GRAND_FINAL" ||
  format === "DOUBLE_ELIMINATION_THIRD_PLACE";

const VARIANTS: Record<
  Exclude<SlotBracketFormat, "SINGLE_ELIMINATION">,
  DoubleEliminationVariant
> = {
  DOUBLE_ELIMINATION_GRAND_FINAL: "grandFinal",
  DOUBLE_ELIMINATION_THIRD_PLACE: "thirdPlace",
};

/** 1 回戦のスロット割当から、形式に応じた組み合わせを作る。 */
export const buildSlotBracket = (
  format: SlotBracketFormat,
  slots: SlotSource[],
): MatchingConfig =>
  format === "SINGLE_ELIMINATION"
    ? buildFromSlots(slots)
    : buildDoubleElimination(slots, VARIANTS[format]);

/** 保存済みの組み合わせが、この形式の画面で部分編集できる形か。 */
export const matchesSlotBracketShape = (
  format: SlotBracketFormat,
  config: MatchingConfig,
): boolean =>
  format === "SINGLE_ELIMINATION"
    ? isSingleEliminationShape(config)
    : isDoubleEliminationShape(config, VARIANTS[format]);

/**
 * 円卓法の組み合わせを上限内でだけ組み立てる。
 *
 * /edit は format を無条件に書き換えられるため、128 人のトーナメントを
 * ROUND_ROBIN にした部門が、生成ボタンを一度も押さないまま残ることがある。
 * 並べ替え・削除はどちらも生成ボタンを経由せずここへ来るので、ここで
 * 弾かないと 8128 試合ぶんの Json が黙って書き込まれてしまう。上限超過
 * なら空を返す。空にしておけば、エントリーを減らして上限内に戻したあと
 * 通常どおり生成し直せる（運営者を詰ませない）。
 */
const buildRoundRobinWithinCap = (entries: DivisionEntry[]): MatchingConfig =>
  entries.length > MAX_ENTRIES.ROUND_ROBIN
    ? { version: 1, matches: [] }
    : buildRoundRobin(entries);

/**
 * エントリーのシード順から組み合わせを丸ごと作り直す。
 * 必要人数に満たなければどの形式でも空を返す（スロット型は builder 自身が、
 * リーグは buildRoundRobinWithinCap の手前で buildRoundRobin が空を返す）。
 */
export const regenerateMatching = (
  format: EditableFormat,
  entries: DivisionEntry[],
): MatchingConfig => {
  switch (format) {
    case "SINGLE_ELIMINATION":
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return buildSlotBracket(format, generateSlots(entries));
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries);
  }
};

/**
 * エントリーを 1 人足したあとの組み合わせ。
 *
 * スロット型（トーナメント・ダブルエリミ）は勝者側 1 回戦のスロットに
 * 「一番下の bye を埋める」だけで既存の対戦カードが残る（buildSlotBracket が
 * 勝者側は buildFromSlots、ダブルエリミはさらに敗者側・決勝も組み直す）。
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
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      // /edit は format を無条件に書き換えられるため、リーグの星取表を
      // 持ったまま SINGLE_ELIMINATION になった部門が存在しうる。その星取表は
      // toSlots で 1 回戦だけ取り出して buildFromSlots に通すと 2 節目以降が
      // 消える（奇数人なら休みの 1 人がそのまま行方不明になる）。この画面が
      // 読めない形の組み合わせを部分編集で書き換えてはいけないので、
      // 触らず current をそのまま返す。参照を変えずに返すことで
      // 「rebuild this」の案内が消えずに残り、それが運営者の逃げ道になる。
      // 同じ参照を返すのは、呼び出し側が参照比較で「作り直したか」を
      // 判別するため（regenerated フラグが正しく false になる）。
      if (!matchesSlotBracketShape(format, current)) {
        return current;
      }
      return buildSlotBracket(
        format,
        placeEntry(toSlots(current), addedEntryId),
      );
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
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return current;
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries);
  }
};
