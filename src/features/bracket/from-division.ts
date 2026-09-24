import type { DivisionFormat } from "@/generated/prisma/enums";
import { aggregateScore, formatScore } from "@/lib/division/score";
import type {
  DivisionEntries,
  DivisionResultConfig,
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
const BRACKET_FORMATS: readonly DivisionFormat[] = ["SINGLE_ELIMINATION"];

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
  resultConfig: DivisionResultConfig;
  participants: DivisionSourceParticipant[];
  /**
   * 展開済みの試合名（試合 id → 表示名）。{{OverallSeq}} は大会全体を
   * 見ないと決まらないため、部門だけを受け取るこの関数では作れない。
   */
  matchNames: ReadonlyMap<string, string>;
  /**
   * 参照エントリー（他部門の結果で決まる枠）の表示名。entryId → 名前。
   * 参加者から名前を引けないため、呼び出し側が lib/division/entry-source.ts の
   * entrySourceLabels で作って渡す。
   */
  entryLabels?: ReadonlyMap<string, string>;
  /**
   * 解決済みの参照エントリーの participantId。entryId → participantId。
   * 表示名の文字列だけの entryLabels では選手番号や所属を付けられないため、
   * 解決済みならこちらを優先して参加者から名前・所属を引く
   * （lib/division/entry-source.ts の entrySourceParticipantIds で作る）。
   */
  entryParticipantIds?: ReadonlyMap<string, string>;
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
 * 扱うのはシングルエリミネーションだけで、勝ち上がり木しか許さない。描画側は
 * 勝ち上がり木を前提にしたレイアウトしか持たないため、リーグの星取表や
 * 扱えない部門は null を返して呼び出し元に案内を出させる。
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
  const sourceById = new Map(input.participants.map((p) => [p.id, p]));

  // entries に現れるものだけを描画対象にする。大会には他の部門にしか出ない
  // 参加者も居るため、そのまま全員を渡すと関係のない名前が混ざる。
  const participants: Participant[] = [];
  const entryIds = new Set<string>();
  for (const entry of input.entries.entries) {
    // 解決済みの参照エントリーは participantId を経由して参加者から名前・
    // 所属を引く。これで prepare-bracket.ts の選手番号の前置（No.◯）も
    // 参加者エントリーと同じ経路にでき、印刷での呼び出しに使える。
    const participantId =
      entry.participantId ?? input.entryParticipantIds?.get(entry.id);
    const source =
      participantId === undefined ? undefined : sourceById.get(participantId);
    // 参加者を引けない（未確定の参照エントリー）は仮名で描く。team は無い。
    // 名前がどちらからも引けないのはデータ不整合なので、従来どおり描かない。
    const name = source?.name ?? input.entryLabels?.get(entry.id);
    if (name === undefined) {
      return null;
    }
    entryIds.add(entry.id);
    participants.push({
      id: entry.id,
      name,
      // 部門内シード。大会全体の Participant.seed ではない。
      seed: entry.seed,
      team: source?.team,
    });
  }

  // resolveBracket が winnerOf の参照先を解決できることを、結果を作る前に
  // 保証しておく。壊れたデータを渡すと resolveBracket 側が例外を投げる。
  const matchIds = new Set(input.matchingConfig.matches.map((m) => m.id));

  const matches: Match[] = [];
  for (const source of input.matchingConfig.matches) {
    // ブラケットは勝ち上がり木として描く。敗者側の試合があるのは
    // 形式を書き換えた部門などの不整合。描けないので描かない。
    if (source.bracket !== "winners") {
      return null;
    }
    for (const slot of source.slots) {
      if (
        (slot.kind === "winnerOf" || slot.kind === "loserOf") &&
        !matchIds.has(slot.matchId)
      ) {
        // 存在しない試合を参照している＝データ不整合。描かない。
        return null;
      }
      if (slot.kind === "loserOf") {
        // 敗者側の枠も勝ち上がり木には置けない。上の参照検証を先に通すため、
        // ここで弾くのは参照が正しいことを確かめた後にする。
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
      // 引けなければテンプレートをそのまま出す。描画を止めるほどの不整合ではない。
      matchName: input.matchNames.get(source.id) ?? source.matchName,
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

    const result: MatchResult = {
      matchId: record.matchId,
      winnerId: record.winnerEntryId,
    };
    if (record.score !== undefined) {
      result.score = record.score;
    }
    // 無効にした項目は公開側にも出さない。設定は表示のフィルタでもある。
    if (
      input.resultConfig.winReason.enabled &&
      record.winReason !== undefined
    ) {
      result.winReason = record.winReason;
    }
    if (input.resultConfig.score.enabled && record.scores !== undefined) {
      const scores = record.scores.flatMap((entry) => {
        const value = formatScore(
          aggregateScore(entry.values, input.resultConfig.score.aggregation),
        );
        return value === null
          ? []
          : [{ participantId: entry.entryId, score: value }];
      });
      if (scores.length > 0) {
        result.scores = scores;
      }
    }
    if (input.resultConfig.note.enabled && record.note !== undefined) {
      result.note = record.note;
    }
    results.push(result);
  }

  return {
    participants,
    bracket: { id: input.id, name: input.name, matches },
    results,
  };
}
