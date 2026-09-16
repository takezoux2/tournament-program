import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";

/** 1 試合の結果を片方の側から見た値。 */
export type LeagueOutcome = "win" | "loss" | "draw";

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

/** 勝点。勝 3・分 1・負 0。 */
const POINTS: Record<LeagueOutcome, number> = { win: 3, draw: 1, loss: 0 };

// 文言は lib/division/label.ts と揃える
const UNKNOWN_PARTICIPANT_LABEL = "（不明な参加者）";

/** 対戦を「左の側から見た結果」に読み替えたもの。outcome null は未実施。 */
type PlayedMatch = {
  matchName: string;
  left: string;
  right: string;
  outcome: LeagueOutcome | null;
};

type Tally = { wins: number; draws: number; losses: number; points: number };

const emptyTally = (): Tally => ({ wins: 0, draws: 0, losses: 0, points: 0 });

const flip = (outcome: LeagueOutcome): LeagueOutcome => {
  switch (outcome) {
    case "win":
      return "loss";
    case "loss":
      return "win";
    case "draw":
      return "draw";
  }
};

/**
 * 組み合わせと勝敗記録を突き合わせて、両方のスロットが entry の試合だけを返す。
 *
 * 勝者がどちらのスロットにも居ない記録は未実施として読む。例外を投げないのは
 * lib/division/resolve.ts と同じ思想で、壊れた記録 1 件で表全体が見えなく
 * なる方が困るため。entry 以外のスロットを持つ試合（形式違いの木）は
 * 呼び出し側が isRoundRobinShape で弾く前提だが、ここでも落ちないよう無視する。
 */
const readMatches = (
  config: MatchingConfig,
  results: DivisionResults,
  matchNames: ReadonlyMap<string, string>,
): PlayedMatch[] => {
  const recorded = new Map(
    results.matches.map((record) => [record.matchId, record.winnerEntryId]),
  );
  const played: PlayedMatch[] = [];
  for (const match of config.matches) {
    const [first, second] = match.slots;
    if (first.kind !== "entry" || second.kind !== "entry") {
      continue;
    }
    const winner = recorded.get(match.id);
    let outcome: LeagueOutcome | null = null;
    if (winner === null) {
      outcome = "draw";
    } else if (winner === first.entryId) {
      outcome = "win";
    } else if (winner === second.entryId) {
      outcome = "loss";
    }
    played.push({
      // 展開に失敗する経路は無いが、引けなければテンプレートをそのまま出す
      // （round-robin/view.ts の星取表と同じ倒し方）。
      matchName: matchNames.get(match.id) ?? match.matchName,
      left: first.entryId,
      right: second.entryId,
      outcome,
    });
  }
  return played;
};

/** 指定したエントリーの集計。matches のうち未実施は数えない。 */
const tallyAll = (
  entryIds: Iterable<string>,
  matches: PlayedMatch[],
): Map<string, Tally> => {
  const tallies = new Map<string, Tally>();
  for (const entryId of entryIds) {
    tallies.set(entryId, emptyTally());
  }
  const add = (entryId: string, outcome: LeagueOutcome) => {
    const tally = tallies.get(entryId);
    if (tally === undefined) {
      return;
    }
    tally.points += POINTS[outcome];
    if (outcome === "win") {
      tally.wins += 1;
    } else if (outcome === "draw") {
      tally.draws += 1;
    } else {
      tally.losses += 1;
    }
  };
  for (const match of matches) {
    if (match.outcome === null) {
      continue;
    }
    add(match.left, match.outcome);
    add(match.right, flip(match.outcome));
  }
  return tallies;
};

type Standing = {
  entryId: string;
  seed: number;
  tally: Tally;
  /** 勝点・勝ち数が並んだ集団の中だけで数えた勝点。集団に居なければ 0 */
  headToHead: number;
  rank: number;
};

/**
 * 順位を付ける。勝点 → 勝ち数 → 直接対決の勝点 → 同順位。
 *
 * 直接対決は「勝点と勝ち数が同じ集団」の中の試合だけで勝点を数え直す。
 * 集団が 3 人以上で巴戦になっていれば全員同じ値になり、同順位に落ちる。
 * 同順位の番号は飛ばす（1, 1, 3）。
 */
const rankStandings = (
  sortedBySeed: { entryId: string; seed: number }[],
  matches: PlayedMatch[],
): Standing[] => {
  const totals = tallyAll(
    sortedBySeed.map((entry) => entry.entryId),
    matches,
  );
  const standings: Standing[] = sortedBySeed.map((entry) => ({
    entryId: entry.entryId,
    seed: entry.seed,
    tally: totals.get(entry.entryId) ?? emptyTally(),
    headToHead: 0,
    rank: 0,
  }));
  standings.sort(
    (left, right) =>
      right.tally.points - left.tally.points ||
      right.tally.wins - left.tally.wins ||
      left.seed - right.seed,
  );

  // 勝点・勝ち数が同じ連続区間を 1 集団として直接対決を見る
  const ordered: Standing[] = [];
  let start = 0;
  while (start < standings.length) {
    let end = start + 1;
    while (
      end < standings.length &&
      standings[end].tally.points === standings[start].tally.points &&
      standings[end].tally.wins === standings[start].tally.wins
    ) {
      end += 1;
    }
    const group = standings.slice(start, end);
    if (group.length > 1) {
      const ids = new Set(group.map((standing) => standing.entryId));
      const inner = tallyAll(
        ids,
        matches.filter((match) => ids.has(match.left) && ids.has(match.right)),
      );
      for (const standing of group) {
        standing.headToHead = inner.get(standing.entryId)?.points ?? 0;
      }
      group.sort(
        (left, right) =>
          right.headToHead - left.headToHead || left.seed - right.seed,
      );
    }
    ordered.push(...group);
    start = end;
  }

  // 順位番号。直前と 3 つの値がすべて同じなら同順位、違えば「自分より上の人数 + 1」
  ordered.forEach((standing, index) => {
    const previous = ordered[index - 1];
    const tied =
      previous !== undefined &&
      previous.tally.points === standing.tally.points &&
      previous.tally.wins === standing.tally.wins &&
      previous.headToHead === standing.headToHead;
    standing.rank = tied ? previous.rank : index + 1;
  });
  return ordered;
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
      nameById.get(entry.participantId) ?? UNKNOWN_PARTICIPANT_LABEL,
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
