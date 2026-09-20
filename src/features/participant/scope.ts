/**
 * 所有権の 2 段。参加者と選手番号は大会単位の属性なので、部門は要らない。
 * 全スライスがこの形で受け渡す。スライスどうしは import できないため、
 * features/division/setup-store.ts の DivisionIds と同じくカテゴリ直下に置く。
 */
export type ParticipantIds = {
  organizationId: string;
  tournamentId: string;
};

/**
 * found: false は「この組織のこの大会が見つからない」。存在しない場合と
 * 権限が無い場合を区別しない。呼び出し側は notFound() へ倒す。
 * features/division/setup-store.ts の DivisionSetupOutcome と同じ役割。
 *
 * 使うのは大会の所有権を自分で確かめる add スライスだけ。他のスライスは
 * 対象を where で引けない時点でエラーを投げるため、包む必要がない。
 */
export type ParticipantOutcome<T> =
  | { found: false }
  | { found: true; value: T };
