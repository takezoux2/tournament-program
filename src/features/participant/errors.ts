import { Data, Predicate } from "effect";

/** 指定された参加者がこの組織のこの大会に無いことを表す。 */
export class ParticipantNotFoundError extends Data.TaggedError(
  "ParticipantNotFoundError",
)<{
  readonly participantId: string;
}> {}

/** 同じ大会に同じメンバーの参加者が既に居ることを表す。 */
export class ParticipantDuplicateError extends Data.TaggedError(
  "ParticipantDuplicateError",
)<{
  readonly memberId: string;
}> {}

/** 選ばれた Member がこの組織に無いことを表す。 */
export class ParticipantMemberNotFoundError extends Data.TaggedError(
  "ParticipantMemberNotFoundError",
)<{
  readonly memberId: string;
}> {}

/** 部門にエントリー済みで削除できないことを表す。 */
export class ParticipantEnteredError extends Data.TaggedError(
  "ParticipantEnteredError",
)<{
  readonly divisionNames: readonly string[];
}> {}

/** 削除の判定中に Division.entries の Json が壊れていたことを表す。 */
export class ParticipantDataError extends Data.TaggedError(
  "ParticipantDataError",
)<{
  readonly divisionId: string;
}> {}

export class UnexpectedParticipantError extends Data.TaggedError(
  "UnexpectedParticipantError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type ParticipantError =
  | ParticipantNotFoundError
  | ParticipantDuplicateError
  | ParticipantMemberNotFoundError
  | ParticipantEnteredError
  | ParticipantDataError
  | UnexpectedParticipantError;

/**
 * ParticipantError の全タグをコンパイラに列挙させるための対照表。
 * union にタグを足してここへの追記を忘れるとコンパイルエラーになる。
 * features/division/errors.ts と同じ仕掛け。
 */
const participantErrorTags: Record<ParticipantError["_tag"], true> = {
  ParticipantNotFoundError: true,
  ParticipantDuplicateError: true,
  ParticipantMemberNotFoundError: true,
  ParticipantEnteredError: true,
  ParticipantDataError: true,
  UnexpectedParticipantError: true,
};

/**
 * `in` ではなく Object.hasOwn を使う。`in` はプロトタイプ鎖まで辿るため、
 * _tag が "toString" のオブジェクトが ParticipantError と判定され、
 * messages.ts の Match.exhaustive が文言を返せず実行時に落ちる。
 */
const isParticipantError = (reason: unknown): reason is ParticipantError =>
  Predicate.isRecord(reason) &&
  Predicate.hasProperty(reason, "_tag") &&
  typeof reason._tag === "string" &&
  Object.hasOwn(participantErrorTags, reason._tag);

/**
 * repository のトランザクション内で投げたドメインのエラーはそのまま通し、
 * それ以外（Prisma の例外など）は UnexpectedParticipantError に写す。
 * ここで写しておくことで、usecase より上の層に Prisma の型が漏れない。
 */
export const toParticipantError = (reason: unknown): ParticipantError =>
  isParticipantError(reason)
    ? reason
    : new UnexpectedParticipantError({ reason });
