import "server-only";
import { DivisionJsonError, parseDivisionEntries } from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";

/** 参加者が出場する部門。表示に要る最小限だけを運ぶ。 */
export type ParticipantDivision = {
  id: string;
  name: string;
};

/** 大会の参加者。表示名は Member から、出場部門は Division.entries から解決済み。 */
export type TournamentParticipant = {
  id: string;
  name: string;
  nameKana: string;
  /** 選手番号。大会単位で Participant が持つ */
  playerNumber: string;
  team?: string;
  /** 出場部門。Division.order 昇順。どの部門にも居なければ空配列。 */
  divisions: ParticipantDivision[];
};

/**
 * 選手番号は文字列だが、閲覧者は数値として読む。numeric: true にしないと
 * "10" が "2" より前に来る。Collator はモジュール直下で 1 度だけ作る
 * （生成が重く、呼び出しのたびに作る理由がない）。
 */
const PLAYER_NUMBER_COLLATOR = new Intl.Collator("ja", { numeric: true });

/**
 * 大会の参加者を、出場部門つきで選手番号の自然順に返す。
 * where を tournament 経由にすることで、組織と大会の所有権を 1 クエリで担保する。
 *
 * 出場部門は Division.entries（Json）からしか分からないため、部門を全件読んで
 * participantId で引ける形に組み直す。出場部門が要らない呼び出し（ブラケット描画・
 * エントリー一覧）には features/division/repository.ts の
 * listParticipantsInTournament が残っており、そちらはこの読み出しを負わない。
 */
export const listParticipantsWithDivisions = async (
  organizationId: string,
  tournamentId: string,
): Promise<TournamentParticipant[]> => {
  const ownership = { tournament: { id: tournamentId, organizationId } };

  const [participants, divisions] = await Promise.all([
    prisma.participant.findMany({
      where: ownership,
      select: {
        id: true,
        team: true,
        playerNumber: true,
        member: { select: { name: true, nameKana: true } },
      },
    }),
    prisma.division.findMany({
      where: ownership,
      orderBy: { order: "asc" },
      select: { id: true, name: true, entries: true },
    }),
  ]);

  const byParticipant = new Map<string, ParticipantDivision[]>();
  for (const division of divisions) {
    let entries: ReturnType<typeof parseDivisionEntries>;
    try {
      entries = parseDivisionEntries(division.entries);
    } catch (reason) {
      // 1 部門の Json が壊れただけで名簿ごと落とさない。この一覧の主題は
      // 参加者で、出場部門はその補足である（features/schedule/repository.ts が
      // resultConfig を既定値で描くのと同じ判断）。削除の可否を決める
      // remove/repository.ts は逆に、読み飛ばさず削除を止める。
      if (reason instanceof DivisionJsonError) {
        continue;
      }
      throw reason;
    }

    for (const entry of entries.entries) {
      const item = { id: division.id, name: division.name };
      const list = byParticipant.get(entry.participantId);
      if (list === undefined) {
        byParticipant.set(entry.participantId, [item]);
      } else {
        list.push(item);
      }
    }
  }

  return participants
    .map((row) => ({
      id: row.id,
      name: row.member.name,
      nameKana: row.member.nameKana,
      playerNumber: row.playerNumber,
      // team は省略可能なプロパティ。null は運ばない。
      team: row.team ?? undefined,
      divisions: byParticipant.get(row.id) ?? [],
    }))
    .sort((left, right) =>
      PLAYER_NUMBER_COLLATOR.compare(left.playerNumber, right.playerNumber),
    );
};
