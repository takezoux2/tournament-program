import { UNKNOWN_PARTICIPANT_LABEL } from "@/lib/division/label";
import {
  flip,
  type LeagueOutcome,
  rankStandings,
  readMatches,
} from "@/lib/division/standings";
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";

// LeagueResultTable がこのファイルから型を引いているので、そのまま通す。
export type { LeagueOutcome };

/** 結果表の 1 マス。outcome が null の対戦は未実施。 */
export type LeagueTableCell =
  | { kind: "self" }
  | { kind: "match"; matchName: string; outcome: LeagueOutcome | null }
  | { kind: "none" };

/** 結果表の 1 行。順位表の列（勝・分・敗・勝点・順位）も持つ。 */
export type LeagueTableRow = {
  entryId: string;
  label: string;
  rank: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  cells: LeagueTableCell[];
};

/** 結果表の全体。headers と各 rows[].cells は同じ並び・同じ長さ。 */
export type LeagueTableView = {
  headers: { entryId: string; label: string }[];
  rows: LeagueTableRow[];
};

/**
 * 勝敗込みの星取表と順位表を 1 つの表にまとめて返す。
 * 行・列とも順位順（同順位の中はシード昇順）。
 */
export const toLeagueTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  results: DivisionResults,
  participants: { id: string; name: string }[],
  /** 展開済みの試合名。{{OverallSeq}} は大会全体を見ないと決まらないので上で作って渡す */
  matchNames: ReadonlyMap<string, string>,
): LeagueTableView => {
  const nameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const sortedBySeed = [...entries.entries].sort(
    (left, right) => left.seed - right.seed,
  );
  const labelByEntryId = new Map(
    sortedBySeed.map((entry) => [
      entry.id,
      (entry.participantId === undefined
        ? undefined
        : nameById.get(entry.participantId)) ?? UNKNOWN_PARTICIPANT_LABEL,
    ]),
  );

  const matches = readMatches(config, results, matchNames);
  const standings = rankStandings(
    sortedBySeed.map((entry) => ({ entryId: entry.id, seed: entry.seed })),
    matches,
  );

  // 「エントリー 2 つの組 → 対戦」の対照表。キーは順序を持たせない
  const pairKey = (left: string, right: string): string =>
    left < right ? `${left} ${right}` : `${right} ${left}`;
  const matchByPair = new Map(
    matches.map((match) => [pairKey(match.left, match.right), match]),
  );

  const headers = standings.map((standing) => ({
    entryId: standing.entryId,
    label: labelByEntryId.get(standing.entryId) ?? UNKNOWN_PARTICIPANT_LABEL,
  }));

  return {
    headers,
    rows: standings.map((standing) => ({
      entryId: standing.entryId,
      label: labelByEntryId.get(standing.entryId) ?? UNKNOWN_PARTICIPANT_LABEL,
      rank: standing.rank,
      wins: standing.tally.wins,
      draws: standing.tally.draws,
      losses: standing.tally.losses,
      points: standing.tally.points,
      cells: headers.map((column): LeagueTableCell => {
        if (column.entryId === standing.entryId) {
          return { kind: "self" };
        }
        const match = matchByPair.get(
          pairKey(standing.entryId, column.entryId),
        );
        if (match === undefined) {
          return { kind: "none" };
        }
        // 対戦は左の側から見た値なので、行が右側なら裏返す
        const outcome =
          match.outcome === null
            ? null
            : match.left === standing.entryId
              ? match.outcome
              : flip(match.outcome);
        return { kind: "match", matchName: match.matchName, outcome };
      }),
    })),
  };
};
