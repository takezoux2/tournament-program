/**
 * 試合番号の編集行 1 つぶんの表示内容。
 *
 * トーナメントの試合番号一覧（single-elimination/view.ts）と
 * リーグの節ごとの一覧（round-robin/view.ts）が同じ行を描くため、
 * どちらの祖先でもあるカテゴリ直下に置いて共有する。
 */
export type MatchNumberRowView = {
  /** BracketMatch.id。保存時にこの id を送る */
  matchId: string;
  matchNumber: string;
  /** 「1回戦 第1試合」「第1節 第1試合」のような構造上の位置 */
  label: string;
  /** 「山田 vs 佐藤」のような対戦の表示 */
  card: string;
};
