import { revalidatePath } from "next/cache";

/**
 * エントリー・組み合わせを変えたあとに再検証すべきページ。
 * 5 つのスライスが同じ 2 本を叩くので、書き漏らしを防ぐためここへ集約する。
 */
export const revalidateDivisionSetup = (
  slug: string,
  tournamentId: string,
  divisionId: string,
): void => {
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`;
  revalidatePath(base);
  revalidatePath(`${base}/setup`);
};
