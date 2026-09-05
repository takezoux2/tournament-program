import { revalidatePath } from "next/cache";

/**
 * 進行順を変えたあとに再検証すべきページ。4 スライスが同じ 1 本を叩くので、
 * 書き漏らしを防ぐためここへ集約する。
 */
export const revalidateSchedule = (
  slug: string,
  tournamentId: string,
): void => {
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}/matches`);
};
