import type { DivisionFormat } from "@/generated/prisma/enums";
import {
  createSlotLabeler,
  matchCardLabel,
  matchPositionLabel,
} from "@/lib/division/label";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";

/**
 * 試合名の編集行 1 つぶんの表示内容。
 *
 * トーナメントとリーグは表示する行の形も並べ方も同じになったため、
 * どちらの祖先でもあるカテゴリ直下に 1 つだけ置いて共有する。
 */
export type MatchNameRowView = {
  /** BracketMatch.id。保存時にこの id を送る */
  matchId: string;
  matchName: string;
  /** 「1回戦 第1試合」（リーグは「第1試合」）のような構造上の位置 */
  label: string;
  /** 「山田 vs 佐藤」のような対戦の表示 */
  card: string;
};

/**
 * 保存済みの組み合わせを実施順の一覧にする。
 *
 * 並べ替えず配列の順をそのまま使う。parseMatchingConfig が sequence 昇順で
 * 返すため、配列の順が実施順そのものになっている。ここで round/order へ
 * 並べ直すと、運営者が並べ替えた結果が画面に出ない。
 *
 * トーナメントとリーグで同じ行・同じ並べ方になったため 1 つにまとめてある。
 * 違いは位置の文言だけで、それは format を label.ts へ渡して吸収する。
 */
export const toMatchOrderView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
  format: DivisionFormat,
): MatchNameRowView[] => {
  const labelSlot = createSlotLabeler(config, entries, participants);

  return config.matches.map((match) => ({
    matchId: match.id,
    matchName: match.matchName,
    label: matchPositionLabel(match, format),
    card: matchCardLabel(match, labelSlot),
  }));
};
