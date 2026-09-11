import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionEntries, DivisionResults, MatchingConfig } from "./types";

/** 検証エラーのメッセージ一覧。空配列なら妥当。 */
export type ValidationErrors = string[];

/** 配列の中で 2 回以上現れた値を返す。 */
const duplicates = <T>(values: readonly T[]): T[] => {
  const seen = new Set<T>();
  const found = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      found.add(value);
    }
    seen.add(value);
  }
  return [...found];
};

/**
 * エントリーの整合性を検証する（spec のルール 1〜3）。
 * existingParticipantIds は、この部門が属する大会の Participant.id の一覧。
 */
export const validateEntries = (
  entries: DivisionEntries,
  existingParticipantIds: readonly string[],
): ValidationErrors => {
  const errors: ValidationErrors = [];
  const list = entries.entries;

  for (const id of duplicates(list.map((entry) => entry.id))) {
    errors.push(`entries[].id が重複しています: ${id}`);
  }
  for (const participantId of duplicates(
    list.map((entry) => entry.participantId),
  )) {
    errors.push(`同じ参加者が二重にエントリーしています: ${participantId}`);
  }
  for (const seed of duplicates(list.map((entry) => entry.seed))) {
    errors.push(`entries[].seed が重複しています: ${seed}`);
  }

  const known = new Set(existingParticipantIds);
  for (const entry of list) {
    if (!known.has(entry.participantId)) {
      errors.push(
        `participantId がこの大会に存在しません: ${entry.participantId}`,
      );
    }
  }

  return errors;
};

/**
 * 組み合わせの整合性を検証する（spec のルール 4〜6）。
 * 参照先の round が自分より必ず小さいことを課すため、循環は構造的に起きない。
 * あわせて sequence が 0 からの連番になっていることも検証する。
 */
export const validateMatchingConfig = (
  config: MatchingConfig,
  entries: DivisionEntries,
): ValidationErrors => {
  const errors: ValidationErrors = [];
  const matches = config.matches;

  for (const id of duplicates(matches.map((match) => match.id))) {
    errors.push(`matchingConfig.matches[].id が重複しています: ${id}`);
  }

  for (const matchName of duplicates(matches.map((match) => match.matchName))) {
    errors.push(
      `matchingConfig.matches[].matchName が重複しています: ${matchName}`,
    );
  }
  for (const match of matches) {
    if (match.matchName === "") {
      errors.push(`${match.id}: matchName が空です`);
    }
  }

  // 実施順は 0 から抜けなく並んでいなければならない。読み出し（parse.ts）が
  // 常にこの形へ正規化するため、ここで捕まえるのは書き込み側（生成・並べ替え）の
  // 不具合。保存の直前にだけ効く網として置く。
  const sequences = matches
    .map((match) => match.sequence)
    .sort((left, right) => left - right);
  if (sequences.some((sequence, index) => sequence !== index)) {
    errors.push(
      `matchingConfig.matches[].sequence が 0 からの連番ではありません: ${sequences.join(", ")}`,
    );
  }

  const entryIds = new Set(entries.entries.map((entry) => entry.id));
  const roundById = new Map(matches.map((match) => [match.id, match.round]));

  for (const match of matches) {
    for (const [index, slot] of match.slots.entries()) {
      const where = `${match.id}.slots[${index}]`;
      if (slot.kind === "bye") {
        continue;
      }
      if (slot.kind === "entry") {
        if (!entryIds.has(slot.entryId)) {
          errors.push(
            `${where}: entryId が entries に存在しません: ${slot.entryId}`,
          );
        }
        continue;
      }
      const sourceRound = roundById.get(slot.matchId);
      if (sourceRound === undefined) {
        errors.push(`${where}: matchId が存在しません: ${slot.matchId}`);
        continue;
      }
      if (sourceRound >= match.round) {
        errors.push(
          `${where}: 参照先 ${slot.matchId} の round ${sourceRound} が自分の round ${match.round} 以上です`,
        );
      }
    }
  }

  return errors;
};

/**
 * その試合のスロットに到達しうる entry id を集める。
 * winnerOf / loserOf は参照先を再帰的にたどる。
 * validateMatchingConfig が round の単調減少を保証していれば循環しないが、
 * 未検証の入力でも止まるよう訪問済みの試合は再訪しない。
 */
export const reachableEntryIds = (
  matchId: string,
  config: MatchingConfig,
): Set<string> => {
  const byId = new Map(config.matches.map((match) => [match.id, match]));
  const found = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const match = byId.get(id);
    if (!match) {
      return;
    }
    for (const slot of match.slots) {
      if (slot.kind === "entry") {
        found.add(slot.entryId);
      } else if (slot.kind !== "bye") {
        visit(slot.matchId);
      }
    }
  };

  visit(matchId);
  return found;
};

/**
 * 勝敗記録の整合性を検証する（spec のルール 7〜9）。
 * 1 試合につき結果は 1 件までとする。
 * `config` は `validateMatchingConfig` を通過済みであることを前提とする。
 * 未検証の config を渡すと、entries に無い entryId が到達可能と判定されうる。
 */
export const validateResults = (
  results: DivisionResults,
  config: MatchingConfig,
  format: DivisionFormat,
): ValidationErrors => {
  const errors: ValidationErrors = [];
  const matchIds = new Set(config.matches.map((match) => match.id));

  for (const matchId of duplicates(
    results.matches.map((record) => record.matchId),
  )) {
    errors.push(`results に同じ matchId が 2 回現れています: ${matchId}`);
  }

  for (const record of results.matches) {
    if (!matchIds.has(record.matchId)) {
      errors.push(
        `matchId が matchingConfig に存在しません: ${record.matchId}`,
      );
      continue;
    }
    if (record.winnerEntryId === null) {
      if (format !== "ROUND_ROBIN") {
        errors.push(
          `引き分けは ROUND_ROBIN でのみ許可されます: ${record.matchId}`,
        );
      }
      continue;
    }
    if (!reachableEntryIds(record.matchId, config).has(record.winnerEntryId)) {
      errors.push(
        `${record.matchId}: winnerEntryId ${record.winnerEntryId} はこの試合に到達しません`,
      );
    }
  }

  return errors;
};
