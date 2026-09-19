import { revalidatePath } from "next/cache";

/**
 * 参加者を足した・消したあとに再検証すべきページ。
 * 公開側の一覧も同じ Participant を読むため一緒に叩く。
 */
export const revalidateParticipants = (
  slug: string,
  tournamentId: string,
): void => {
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}/participants`);
  revalidatePath(`/t/${tournamentId}/participants`);
};

/**
 * 選手番号を変えたあとに再検証すべきページ。番号は大会内で共通なので
 * 参加者一覧は常に対象。部門の編集画面から変えたときは divisionId が渡るので
 * その部門の 3 画面も叩く（形式ごとに編集画面が分かれているが、呼び出し側は
 * 形式を知らないため両方叩く。存在しない側を叩いても害はない）。
 *
 * features/division/revalidate.ts の revalidateDivisionSetup と同じ 3 本だが、
 * 兄弟カテゴリは import できないためここに持つ。
 */
export const revalidatePlayerNumber = (
  slug: string,
  tournamentId: string,
  divisionId: string | null,
): void => {
  revalidateParticipants(slug, tournamentId);
  if (divisionId === null) {
    return;
  }
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`;
  revalidatePath(base);
  revalidatePath(`${base}/setup`);
  revalidatePath(`${base}/league`);
};
