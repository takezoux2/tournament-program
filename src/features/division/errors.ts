import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";
import { DivisionJsonError } from "@/lib/division/parse";

/**
 * order の unique 制約（@@unique([tournamentId, order])）に触れたことを表す。
 * 作成時の同時採番と、並べ替えの退避値どうしの衝突の両方でここに来る。
 */
export class DivisionOrderConflictError extends Data.TaggedError(
  "DivisionOrderConflictError",
)<{
  readonly tournamentId: string;
}> {}

export class UnexpectedDivisionError extends Data.TaggedError(
  "UnexpectedDivisionError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

/** 勝敗が記録済みの部門を編集しようとしたことを表す。 */
export class DivisionResultsRecordedError extends Data.TaggedError(
  "DivisionResultsRecordedError",
)<{
  readonly divisionId: string;
}> {}

/** 組み合わせを作るにはエントリーが足りないことを表す。 */
export class DivisionNotEnoughEntriesError extends Data.TaggedError(
  "DivisionNotEnoughEntriesError",
)<{
  readonly divisionId: string;
}> {}

/**
 * DB の Json が想定の形をしていない、または保存直前の検証を通らなかったことを表す。
 * 純粋関数が正しければ後者には到達しない。到達したらバグである。
 */
export class DivisionDataError extends Data.TaggedError("DivisionDataError")<{
  readonly reason: unknown;
}> {}

/** エントリー数の上限に達していることを表す。 */
export class DivisionEntryLimitError extends Data.TaggedError(
  "DivisionEntryLimitError",
)<{
  readonly divisionId: string;
}> {}

/** 同じ参加者を二重にエントリーしようとしたことを表す。 */
export class DivisionDuplicateEntryError extends Data.TaggedError(
  "DivisionDuplicateEntryError",
)<{
  readonly divisionId: string;
}> {}

/** 選ばれた Member がこの組織に無いことを表す。 */
export class DivisionMemberNotFoundError extends Data.TaggedError(
  "DivisionMemberNotFoundError",
)<{
  readonly memberId: string;
}> {}

export type DivisionError =
  | DivisionOrderConflictError
  | UnexpectedDivisionError
  | DivisionResultsRecordedError
  | DivisionNotEnoughEntriesError
  | DivisionDataError
  | DivisionEntryLimitError
  | DivisionDuplicateEntryError
  | DivisionMemberNotFoundError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toDivisionError = (
  reason: unknown,
  tournamentId: string,
): DivisionError => {
  // トランザクションの中から投げたドメインエラーは、ここで
  // UnexpectedDivisionError に潰さずそのまま通す。
  if (
    reason instanceof DivisionOrderConflictError ||
    reason instanceof DivisionResultsRecordedError ||
    reason instanceof DivisionNotEnoughEntriesError ||
    reason instanceof DivisionDataError ||
    reason instanceof DivisionEntryLimitError ||
    reason instanceof DivisionDuplicateEntryError ||
    reason instanceof DivisionMemberNotFoundError
  ) {
    return reason;
  }
  if (reason instanceof DivisionJsonError) {
    return new DivisionDataError({ reason });
  }
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new DivisionOrderConflictError({ tournamentId });
  }
  return new UnexpectedDivisionError({ reason });
};
