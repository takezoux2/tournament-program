import { UNKNOWN_PARTICIPANT_LABEL } from "@/lib/division/label";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";

/** エントリーを seed 昇順に並べ、表示名を解決した一覧を返す。 */
const labeledEntries = (
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): { entryId: string; label: string }[] => {
  const nameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  return [...entries.entries]
    .sort((left, right) => left.seed - right.seed)
    .map((entry) => ({
      entryId: entry.id,
      // 名前を引けなくても行は出す。参加者一覧が古いだけで編集不能に
      // なるのは困る。
      label:
        (entry.participantId === undefined
          ? undefined
          : nameById.get(entry.participantId)) ?? UNKNOWN_PARTICIPANT_LABEL,
    }));
};

/** 星取表の 1 マス。 */
export type CrossTableCell =
  | { kind: "self" }
  | { kind: "match"; matchName: string }
  | { kind: "none" };

/** 星取表の全体。headers と各 rows[].cells は同じ並び・同じ長さ。 */
export type CrossTableView = {
  headers: { entryId: string; label: string }[];
  rows: { entryId: string; label: string; cells: CrossTableCell[] }[];
};

/**
 * 誰と誰が当たるかを一目で見せる表。マスには試合名を入れる。
 * 対戦の向き（どちらがスロット 0 か）は表示上の意味を持たないので、
 * 表は左右対称になる。
 */
export const toCrossTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
  /** 展開済みの試合名。{{OverallSeq}} は大会全体を見ないと決まらないので上で作って渡す */
  matchNames: ReadonlyMap<string, string>,
): CrossTableView => {
  const headers = labeledEntries(entries, participants);

  // 「エントリー 2 つの組 → 試合名」の対照表。キーは順序を持たせない。
  const pairKey = (left: string, right: string): string =>
    left < right ? `${left} ${right}` : `${right} ${left}`;
  const nameByPair = new Map<string, string>();
  for (const match of config.matches) {
    const [first, second] = match.slots;
    if (first.kind === "entry" && second.kind === "entry") {
      nameByPair.set(
        pairKey(first.entryId, second.entryId),
        // 展開に失敗する経路は無いが、引けなければテンプレートをそのまま出す。
        matchNames.get(match.id) ?? match.matchName,
      );
    }
  }

  return {
    headers,
    rows: headers.map((row) => ({
      entryId: row.entryId,
      label: row.label,
      cells: headers.map((column): CrossTableCell => {
        if (row.entryId === column.entryId) {
          return { kind: "self" };
        }
        const matchName = nameByPair.get(pairKey(row.entryId, column.entryId));
        return matchName === undefined
          ? { kind: "none" }
          : { kind: "match", matchName };
      }),
    })),
  };
};
