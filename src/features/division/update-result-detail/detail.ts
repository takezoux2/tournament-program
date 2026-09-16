import type {
  DivisionResultConfig,
  MatchResultRecord,
  MatchScoreEntry,
} from "@/lib/division/types";
import type { UpdateResultDetailInput } from "./schema";

/**
 * その勝因を保存してよいか。
 *
 * 選択肢に無い任意の文字列を投げ込めると「部門ごとに勝因を決める」という設定の
 * 意味が無くなる。一方で、設定から消された値が既にその試合に入っている場合は
 * 受け入れないと、勝因を変えずにスコアだけ直すことができなくなる。
 */
export const isAcceptableWinReason = (
  label: string,
  config: DivisionResultConfig,
  existing: MatchResultRecord,
): boolean =>
  label === "" ||
  config.winReason.options.includes(label) ||
  existing.winReason === label;

/**
 * 既存の記録に詳細を反映した新しい記録を返す。元の値は変更しない。
 * winnerEntryId には触らないので、下流の記録を消す必要が無い。
 *
 * 無効な項目は書かず、既存値も消さない。画面に出ていない項目を直接 POST で
 * 書き換えられないようにしつつ、「設定は表示と入力のフィルタでしかない」という
 * 方針とも揃う。
 */
export const buildDetailRecord = (
  existing: MatchResultRecord,
  input: UpdateResultDetailInput,
  config: DivisionResultConfig,
  /** その試合に立っている 2 人の DivisionEntry.id */
  standingEntryIds: readonly string[],
): MatchResultRecord => {
  const next: MatchResultRecord = { ...existing };

  if (config.winReason.enabled) {
    const label = input.winReason.trim();
    if (label === "") {
      delete next.winReason;
    } else {
      next.winReason = label;
    }
  }

  if (config.score.enabled) {
    const scores = input.scores
      // 送られてきた entryId は信用しない。その試合に立っている 2 人だけを通す。
      .filter((entry) => standingEntryIds.includes(entry.entryId))
      // 同じ人が 2 件あると表示・集計に使う方が決まらない。先に来た方を正とする。
      .filter(
        (entry, index, all) =>
          all.findIndex((other) => other.entryId === entry.entryId) === index,
      )
      .map(
        (entry): MatchScoreEntry => ({
          entryId: entry.entryId,
          // 設定を減らしたあとに古い画面から送られてきた余りを落とす。
          values: entry.values.slice(0, config.score.count),
        }),
      )
      // 1 つも入っていない人は持たない。空の配列を残すと「記録がある」ように見える。
      .filter((entry) => entry.values.some((value) => value !== null));

    if (scores.length === 0) {
      delete next.scores;
    } else {
      next.scores = scores;
    }
  }

  if (config.note.enabled) {
    const note = input.note.trim();
    if (note === "") {
      delete next.note;
    } else {
      next.note = note;
    }
  }

  return next;
};
