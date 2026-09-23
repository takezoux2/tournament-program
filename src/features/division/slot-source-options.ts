import type { DivisionFormat } from "@/generated/prisma/enums";
import {
  type EntrySourceDivision,
  matchSourceName,
} from "@/lib/division/entry-source";

/** スロット編集で選べる参照先の 1 部門。 */
export type SlotSourceOption = {
  divisionId: string;
  divisionName: string;
  format: DivisionFormat;
  /** 勝者・敗者に選べる試合。並びは保存順 */
  matches: { matchId: string; label: string }[];
  /** リーグのときに選べる順位の上限（エントリー数）。リーグ以外は 0 */
  maxRank: number;
};

/**
 * 参照先の選択肢。自部門は除く（自分の結果で自分の枠は決まらない）。
 *
 * 試合の名前は展開済みのもの（{{OverallSeq}} 入り）を優先し、無ければ位置
 * （「1回戦 (1)」）、位置を持たないリーグではテンプレートをそのまま出す。
 * 文言の決め方を lib/division/entry-source.ts の仮名と揃えてあるので、
 * 選んだ直後に画面に出る文字列と選択肢の文字列がそろう。
 */
export const buildSlotSourceOptions = (
  divisions: EntrySourceDivision[],
  currentDivisionId: string,
): SlotSourceOption[] =>
  divisions
    .filter((division) => division.id !== currentDivisionId)
    .map((division) => ({
      divisionId: division.id,
      divisionName: division.name,
      format: division.format,
      matches: division.matchingConfig.matches.map((match) => ({
        matchId: match.id,
        label: matchSourceName(match, division.format, division.matchNames),
      })),
      maxRank:
        division.format === "ROUND_ROBIN" ? division.entries.entries.length : 0,
    }));
