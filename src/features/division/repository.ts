import "server-only";
import type { DivisionFormat } from "@/generated/prisma/enums";
import {
  type EntrySourceDivision,
  entrySourceLabels,
  entrySourceParticipantIds,
  entrySourceWarnings,
  resolveEntrySources,
} from "@/lib/division/entry-source";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  buildOverallSeq,
  type OverallOrderDivision,
} from "@/lib/division/overall-order";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";

export type DivisionSummary = {
  id: string;
  name: string;
  order: number;
  format: DivisionFormat;
};

/**
 * Json 4 列は Prisma が JsonValue で返す。ここでは形を保証せず unknown として運び、
 * 検証は lib/division の parse 関数に任せる。
 */
export type DivisionDetail = DivisionSummary & {
  entries: unknown;
  matchingConfig: unknown;
  results: unknown;
  resultConfig: unknown;
  createdAt: Date;
};

/** ブラケット描画とエントリー一覧に渡す参加者。表示名は Member から解決済み。 */
export type DivisionParticipant = {
  id: string;
  name: string;
  nameKana: string;
  /** 選手番号。大会単位で Participant が持つ */
  playerNumber: string;
  team?: string;
  /**
   * 参加者の Member。setup 画面が「この部門に配置済みの人」を
   * メンバーの選択肢から除くのに使う。一覧以外の経路では埋めないので省略可能。
   */
  memberId?: string;
};

/**
 * 部門一覧。order 昇順で並べて返す。削除は order を詰め直さないため、
 * 欠番があることは前提として扱う（reorder/domain.ts 参照）。
 * where を tournament 経由にすることで、組織と大会の所有権を 1 クエリで担保する。
 */
export const listDivisionsInTournament = (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionSummary[]> =>
  prisma.division.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true, format: true },
  });

/** 部門の詳細（Json 4 列込み）。1 件引きと一覧引きで列をずらさないよう共有する。 */
const DIVISION_DETAIL_SELECT = {
  id: true,
  name: true,
  order: true,
  format: true,
  entries: true,
  matchingConfig: true,
  results: true,
  resultConfig: true,
  createdAt: true,
} as const;

/**
 * 組織 → 大会 → 部門の 3 段の所有権を where に入れる。
 * id だけで引いて後から所属を検証する形にすると、検証を書き忘れた箇所が
 * そのまま穴になる。この形なら書き忘れは「見つからない」に倒れる。
 */
export const findDivisionInTournament = (
  organizationId: string,
  tournamentId: string,
  divisionId: string,
): Promise<DivisionDetail | null> =>
  prisma.division.findFirst({
    where: { id: divisionId, tournament: { id: tournamentId, organizationId } },
    select: DIVISION_DETAIL_SELECT,
  });

/**
 * 大会の全部門を詳細込みで order 昇順に返す。印刷ページが全部門の表を
 * 1 度に描くために使う（部門ごとに findDivisionInTournament を呼ぶと
 * 部門数だけクエリが増える）。所有権の where は listDivisionsInTournament と同じ。
 */
export const listDivisionDetailsInTournament = (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionDetail[]> =>
  prisma.division.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    orderBy: { order: "asc" },
    select: DIVISION_DETAIL_SELECT,
  });

/**
 * 大会の参加者。表示名は Participant ではなく Member が持つため join して解決する。
 * 解決済みの形で返すことで、描画側のアダプタ（features/bracket/from-division.ts）を
 * DB を知らない純粋関数に保てる。
 */
export const listParticipantsInTournament = async (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionParticipant[]> => {
  const rows = await prisma.participant.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    select: {
      id: true,
      team: true,
      playerNumber: true,
      member: { select: { id: true, name: true, nameKana: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.member.name,
    nameKana: row.member.nameKana,
    playerNumber: row.playerNumber,
    // bracket 側の Participant.team は省略可能なプロパティ。null は運ばない。
    team: row.team ?? undefined,
    memberId: row.member.id,
  }));
};

/**
 * 大会の全試合の通し番号を読む。試合名の {{OverallSeq}} を展開するのに要る。
 *
 * 所有権は呼び出し側のページが既に確立している（管理画面は
 * requireOrganization と findDivisionInTournament の 3 段 where、公開画面は
 * findPublicTournament の公開ゲート）。ここは番号を作るだけで、
 * 大会 id 以外の絞り込みは行わない。
 *
 * features/schedule にも同じ材料を読む関数があるが、features どうしは
 * 依存できないため別に持つ。並びの規則そのものは lib/division/overall-order.ts
 * の 1 つを共有しているので、番号がずれることはない。
 */
export const listOverallOrderSources = async (
  tournamentId: string,
): Promise<Map<string, number>> => {
  const [divisions, items] = await Promise.all([
    prisma.division.findMany({
      where: { tournamentId },
      orderBy: { order: "asc" },
      select: { id: true, order: true, matchingConfig: true },
    }),
    prisma.scheduleItem.findMany({
      where: { tournamentId, kind: "MATCH" },
      orderBy: { order: "asc" },
      select: { divisionId: true, matchId: true },
    }),
  ]);

  return buildOverallSeq(
    divisions.map(
      (division): OverallOrderDivision => ({
        id: division.id,
        order: division.order,
        // 壊れた Json を持つ部門があっても他の部門の番号は出したいので、
        // その部門だけ試合ゼロとして扱う。
        matchIds: (() => {
          try {
            return parseMatchingConfig(division.matchingConfig).matches.map(
              (match) => match.id,
            );
          } catch {
            return [];
          }
        })(),
      }),
    ),
    // kind: "MATCH" の行は divisionId / matchId を必ず持つが、列としては
    // nullable なので落として渡す。
    items.flatMap((item) =>
      item.divisionId === null || item.matchId === null
        ? []
        : [{ divisionId: item.divisionId, matchId: item.matchId }],
    ),
  );
};

/** 1 部門ぶんの、参照エントリーの表示名と運営に見せる注意書き。 */
export type EntrySourceView = {
  /** entryId → 画面に出す名前。参照エントリーだけを含む */
  labels: Map<string, string>;
  /**
   * entryId → participantId。解決済みの参照エントリーだけを含む。
   * ブラケットの描画が選手番号・所属を参加者と同じ経路で引くのに使う
   * （entrySourceParticipantIds のコメント参照）。
   */
  participantIds: Map<string, string>;
  /** 同順位・循環・参照切れ・重複の注意書き。無ければ空配列 */
  warnings: string[];
};

/**
 * 参照エントリーを解決して、部門ごとの表示名と注意書きにする。
 *
 * 参照は大会の中で閉じるので、1 部門を描くページでも大会の全部門を 1 度
 * 読む。部門ごとに引くとクエリが部門数だけ増えるため、印刷ページと同じ
 * listDivisionDetailsInTournament を使う。
 *
 * 壊れた Json を持つ部門はその部門だけ除いて続ける（他の部門の表示は
 * 出したい）。除かれた部門を参照している枠は「参照先が見つかりません」に
 * なる。
 */
export type EntrySourceContext = {
  views: Map<string, EntrySourceView>;
  /** 解決に使ったスナップショット。スロット編集の選択肢作りが使い回す */
  divisions: EntrySourceDivision[];
};

export const loadEntrySourceContext = async (
  organizationId: string,
  tournamentId: string,
  overallSeq: ReadonlyMap<string, number>,
  participants: { id: string; name: string }[],
): Promise<EntrySourceContext> => {
  const rows = await listDivisionDetailsInTournament(
    organizationId,
    tournamentId,
  );

  const divisions: EntrySourceDivision[] = [];
  for (const row of rows) {
    try {
      const matchingConfig = parseMatchingConfig(row.matchingConfig);
      divisions.push({
        id: row.id,
        name: row.name,
        format: row.format,
        entries: parseDivisionEntries(row.entries),
        matchingConfig,
        results: parseDivisionResults(row.results),
        matchNames: resolveMatchNames(matchingConfig, row.id, overallSeq),
      });
    } catch {
      // 壊れた Json を持つ部門はこの部門だけ除いて続ける
    }
  }

  const participantNameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const resolved = resolveEntrySources(divisions);

  const views = new Map(
    divisions.map((division) => {
      const entries = resolved.get(division.id) ?? new Map();
      // 1 回戦のスロットに置かれていないエントリーは設計上残る（試合の
      // 削除で外れたものや旧画面で登録したもの。assign-slot/repository.ts の
      // コメント参照）。ブラケット上の枠の数と警告の件数を揃えるため、
      // 置かれている entryId だけを警告の対象にする。組み合わせが
      // 未作成（試合ゼロ）の部門ではこの集合が空になり警告は出ない。
      const placedEntryIds = new Set(
        division.matchingConfig.matches.flatMap((match) =>
          match.slots.flatMap((slot) =>
            slot.kind === "entry" ? [slot.entryId] : [],
          ),
        ),
      );
      return [
        division.id,
        {
          labels: entrySourceLabels(entries, participantNameById),
          participantIds: entrySourceParticipantIds(entries),
          warnings: entrySourceWarnings(
            division.entries,
            entries,
            participantNameById,
            placedEntryIds,
          ),
        },
      ];
    }),
  );

  return { views, divisions };
};
