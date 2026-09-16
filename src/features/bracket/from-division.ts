import type { DivisionFormat } from "@/generated/prisma/enums";
import type {
  DivisionEntries,
  DivisionResults,
  SlotSource as DivisionSlotSource,
  MatchingConfig,
} from "@/lib/division/types";
import type {
  Bracket,
  Match,
  MatchResult,
  Participant,
  SlotSource,
} from "./types";

/** ブラケットとして描ける形式。リーグは星取表（LeagueResultTable）で描く。 */
const BRACKET_FORMATS: readonly DivisionFormat[] = [
  "SINGLE_ELIMINATION",
  "DOUBLE_ELIMINATION_GRAND_FINAL",
  "DOUBLE_ELIMINATION_THIRD_PLACE",
];

/** 表示名を解決済みの参加者。DB からの取得は呼び出し側（repository）が行う。 */
export type DivisionSourceParticipant = {
  id: string;
  name: string;
  team?: string;
};

export type FromDivisionInput = {
  /** Division.id。Bracket.id に使う */
  id: string;
  /** Division.name。Bracket.name に使う */
  name: string;
  format: DivisionFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  results: DivisionResults;
  participants: DivisionSourceParticipant[];
};

export type FromDivisionResult = {
  participants: Participant[];
  bracket: Bracket;
  results: MatchResult[];
};

/**
 * 描画側の SlotSource へ写す。
 */
const toSlotSource = (source: DivisionSlotSource): SlotSource => {
  switch (source.kind) {
    case "entry":
      // 描画側の participantId には entryId をそのまま使う。matchingConfig も
      // results も entryId で参照しているため、写像を 1 つに保てる。
      return { kind: "participant", participantId: source.entryId };
    case "winnerOf":
      return { kind: "winnerOf", matchId: source.matchId };
    case "loserOf":
      return { kind: "loserOf", matchId: source.matchId };
    case "bye":
      return { kind: "bye" };
  }
};

/**
 * Division の Json を features/bracket の描画型へ変換する。
 *
 * SE と DE を扱う。SE は勝ち上がり木だけを許す。描画側は勝ち上がり木を前提に
 * したレイアウトしか持たないため、リーグの星取表や扱えない部門は null を
 * 返して呼び出し元に案内を出させる。
 */
export function fromDivision(
  input: FromDivisionInput,
): FromDivisionResult | null {
  if (!BRACKET_FORMATS.includes(input.format)) {
    return null;
  }
  if (input.matchingConfig.matches.length === 0) {
    return null;
  }
  const singleElimination = input.format === "SINGLE_ELIMINATION";

  const sourceById = new Map(input.participants.map((p) => [p.id, p]));

  // entries に現れるものだけを描画対象にする。大会には他の部門にしか出ない
  // 参加者も居るため、そのまま全員を渡すと関係のない名前が混ざる。
  const participants: Participant[] = [];
  const entryIds = new Set<string>();
  for (const entry of input.entries.entries) {
    const source = sourceById.get(entry.participantId);
    if (!source) {
      // エントリーの参照先が欠けている＝データ不整合。描かない。
      return null;
    }
    entryIds.add(entry.id);
    participants.push({
      id: entry.id,
      name: source.name,
      // 部門内シード。大会全体の Participant.seed ではない。
      seed: entry.seed,
      team: source.team,
    });
  }

  // resolveBracket が winnerOf の参照先を解決できることを、結果を作る前に
  // 保証しておく。壊れたデータを渡すと resolveBracket 側が例外を投げる。
  const matchIds = new Set(input.matchingConfig.matches.map((m) => m.id));

  const matches: Match[] = [];
  for (const source of input.matchingConfig.matches) {
    // シングルエリミネーションに敗者側の試合があるのは形式を書き換えた
    // 部門などの不整合。勝ち上がり木として描けないので描かない。
    if (singleElimination && source.bracket !== "winners") {
      return null;
    }
    for (const slot of source.slots) {
      if (singleElimination && slot.kind === "loserOf") {
        return null;
      }
      if (
        (slot.kind === "winnerOf" || slot.kind === "loserOf") &&
        !matchIds.has(slot.matchId)
      ) {
        // 存在しない試合を参照している＝データ不整合。描かない。
        return null;
      }
      if (slot.kind === "entry" && !entryIds.has(slot.entryId)) {
        // matchingConfig 生成後にエントリーが削除された等の不整合。描かない。
        return null;
      }
    }
    matches.push({
      id: source.id,
      bracket: source.bracket,
      round: source.round,
      order: source.order,
      matchNumber: source.matchNumber,
      slots: [toSlotSource(source.slots[0]), toSlotSource(source.slots[1])],
    });
  }

  const results: MatchResult[] = [];
  for (const record of input.results.matches) {
    // 引き分けは ROUND_ROBIN 専用で、描画側の winnerId は null を取れない。
    // 結果ごと捨てて、その試合は未決として描く。
    if (record.winnerEntryId === null) {
      continue;
    }
    results.push({
      matchId: record.matchId,
      winnerId: record.winnerEntryId,
      score: record.score,
    });
  }

  return {
    participants,
    bracket: { id: input.id, name: input.name, matches },
    results,
  };
}
