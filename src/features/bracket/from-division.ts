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
 * 描画側の SlotSource へ写す。対応できない種類は null を返し、呼び出し元が
 * 部門ごと描画対象から外す。
 */
const toSlotSource = (source: DivisionSlotSource): SlotSource | null => {
  switch (source.kind) {
    case "entry":
      // 描画側の participantId には entryId をそのまま使う。matchingConfig も
      // results も entryId で参照しているため、写像を 1 つに保てる。
      return { kind: "participant", participantId: source.entryId };
    case "winnerOf":
      return { kind: "winnerOf", matchId: source.matchId };
    case "bye":
      return { kind: "bye" };
    case "loserOf":
      // 敗者復活は features/bracket が扱えない。
      return null;
  }
};

/**
 * Division の Json を features/bracket の描画型へ変換する。
 *
 * 対応するのは SINGLE_ELIMINATION のみ。描画側は勝ち上がり木を前提にしており、
 * 敗者ブラケットのレイアウトもリーグの星取表も持たないため、扱えない部門は
 * null を返して呼び出し元に案内を出させる。
 */
export function fromDivision(
  input: FromDivisionInput,
): FromDivisionResult | null {
  if (input.format !== "SINGLE_ELIMINATION") {
    return null;
  }
  if (input.matchingConfig.matches.length === 0) {
    return null;
  }

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
    if (source.bracket !== "winners") {
      return null;
    }
    for (const slot of source.slots) {
      if (slot.kind === "winnerOf" && !matchIds.has(slot.matchId)) {
        // 存在しない試合を参照している＝データ不整合。描かない。
        return null;
      }
      if (slot.kind === "entry" && !entryIds.has(slot.entryId)) {
        // matchingConfig 生成後にエントリーが削除された等の不整合。描かない。
        return null;
      }
    }
    const first = toSlotSource(source.slots[0]);
    const second = toSlotSource(source.slots[1]);
    if (first === null || second === null) {
      return null;
    }
    matches.push({
      id: source.id,
      round: source.round,
      order: source.order,
      slots: [first, second],
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
