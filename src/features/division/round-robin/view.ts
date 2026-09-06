import {
  createSlotLabeler,
  matchCardLabel,
  matchPositionLabel,
} from "@/lib/division/label";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import type { MatchNumberRowView } from "../match-number-view";

/** 1 節ぶんの表示内容。 */
export type LeagueRoundView = {
  /** 節番号（1 始まり） */
  round: number;
  matches: MatchNumberRowView[];
  /**
   * その節に試合が無いエントリーの表示名。偶数人なら常に空。
   * 休みは matchingConfig に保存しないので、ここで差分から算出する。
   */
  restingLabels: string[];
};

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
      // なるのは困る。文言は lib/division/label.ts と揃える。
      label: nameById.get(entry.participantId) ?? "（不明な参加者）",
    }));
};

/**
 * 保存済みの組み合わせを節ごとの一覧に変換する。
 * 節の昇順、節の中は order の昇順。試合番号の編集フォームもこの行を使う。
 */
export const toRoundView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): LeagueRoundView[] => {
  const labelSlot = createSlotLabeler(config, entries, participants);
  const all = labeledEntries(entries, participants);

  const byRound = new Map<number, typeof config.matches>();
  for (const match of config.matches) {
    byRound.set(match.round, [...(byRound.get(match.round) ?? []), match]);
  }

  return [...byRound.keys()]
    .sort((left, right) => left - right)
    .map((round) => {
      const matches = [...(byRound.get(round) ?? [])].sort(
        (left, right) => left.order - right.order,
      );

      const playing = new Set(
        matches.flatMap((match) =>
          match.slots.flatMap((slot) =>
            slot.kind === "entry" ? [slot.entryId] : [],
          ),
        ),
      );

      return {
        round,
        matches: matches.map((match) => ({
          matchId: match.id,
          matchNumber: match.matchNumber,
          label: matchPositionLabel(match, "ROUND_ROBIN"),
          card: matchCardLabel(match, labelSlot),
        })),
        restingLabels: all
          .filter((entry) => !playing.has(entry.entryId))
          .map((entry) => entry.label),
      };
    });
};

/** 星取表の 1 マス。 */
export type CrossTableCell =
  | { kind: "self" }
  | { kind: "match"; matchNumber: string }
  | { kind: "none" };

/** 星取表の全体。headers と各 rows[].cells は同じ並び・同じ長さ。 */
export type CrossTableView = {
  headers: { entryId: string; label: string }[];
  rows: { entryId: string; label: string; cells: CrossTableCell[] }[];
};

/**
 * 誰と誰が当たるかを一目で見せる表。マスには試合番号を入れる。
 * 対戦の向き（どちらがスロット 0 か）は表示上の意味を持たないので、
 * 表は左右対称になる。
 */
export const toCrossTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): CrossTableView => {
  const headers = labeledEntries(entries, participants);

  // 「エントリー 2 つの組 → 試合番号」の対照表。キーは順序を持たせない。
  const pairKey = (left: string, right: string): string =>
    left < right ? `${left} ${right}` : `${right} ${left}`;
  const numberByPair = new Map<string, string>();
  for (const match of config.matches) {
    const [first, second] = match.slots;
    if (first.kind === "entry" && second.kind === "entry") {
      numberByPair.set(
        pairKey(first.entryId, second.entryId),
        match.matchNumber,
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
        const matchNumber = numberByPair.get(
          pairKey(row.entryId, column.entryId),
        );
        return matchNumber === undefined
          ? { kind: "none" }
          : { kind: "match", matchNumber };
      }),
    })),
  };
};
