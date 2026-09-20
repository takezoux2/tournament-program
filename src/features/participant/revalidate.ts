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
 * 参加者一覧は常に対象。EntryList はどの部門の画面でも
 * `No.{playerNumber}` を描くため、編集の起点（参加者一覧か特定の部門か）に
 * 関わらず、大会に属する全部門の画面を再検証しないと他の部門が古い番号の
 * まま残る。そのため呼び出し側から大会の全 divisionId を受け取り、
 * それぞれの 3 画面を叩く（形式ごとに編集画面が分かれているが、呼び出し側は
 * 形式を知らないため両方叩く。存在しない側を叩いても害はない）。
 *
 * features/division/revalidate.ts の revalidateDivisionSetup と同じ 3 本だが、
 * 兄弟カテゴリは import できないためここに持つ。
 */
export const revalidatePlayerNumber = (
  slug: string,
  tournamentId: string,
  divisionIds: readonly string[],
): void => {
  revalidateParticipants(slug, tournamentId);
  for (const divisionId of divisionIds) {
    const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`;
    revalidatePath(base);
    revalidatePath(`${base}/setup`);
    revalidatePath(`${base}/league`);
  }
};
