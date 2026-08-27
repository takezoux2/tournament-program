import type { DivisionEntries, MatchingConfig } from "./types";

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
