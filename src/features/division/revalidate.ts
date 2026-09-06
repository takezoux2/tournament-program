import { revalidatePath } from "next/cache";

/**
 * エントリー・組み合わせを変えたあとに再検証すべきページ。
 * 全スライスが同じ組を叩くので、書き漏らしを防ぐためここへ集約する。
 * 形式ごとに編集画面が分かれているが、スライスは形式を知らずに呼ばれるため
 * 両方を再検証する。存在しない側を叩いても害はない。
 */
export const revalidateDivisionSetup = (
  slug: string,
  tournamentId: string,
  divisionId: string,
): void => {
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`;
  revalidatePath(base);
  revalidatePath(`${base}/setup`);
  revalidatePath(`${base}/league`);
};

/**
 * 勝敗を書き換えたあとに再検証すべきページ。結果入力の一覧、進行順の一覧、
 * ブラケットを描く部門詳細の 3 本が同じ results を読む。
 */
export const revalidateDivisionResults = (
  slug: string,
  tournamentId: string,
  divisionId: string,
): void => {
  const base = `/orgs/${slug}/tournaments/${tournamentId}`;
  revalidatePath(`${base}/results`);
  revalidatePath(`${base}/matches`);
  revalidatePath(`${base}/divisions/${divisionId}`);
};
