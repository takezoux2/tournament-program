import { Data, Predicate } from "effect";
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

/** エントリー数の上限に達していることを表す。上限は形式によって変わる。 */
export class DivisionEntryLimitError extends Data.TaggedError(
  "DivisionEntryLimitError",
)<{
  readonly divisionId: string;
  readonly limit: number;
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

/** 指定された試合が組み合わせに無いことを表す。 */
export class DivisionMatchNotFoundError extends Data.TaggedError(
  "DivisionMatchNotFoundError",
)<{
  readonly matchId: string;
}> {}

/** 試合番号が部門内の別の試合と重複していることを表す。 */
export class DivisionMatchNumberConflictError extends Data.TaggedError(
  "DivisionMatchNumberConflictError",
)<{
  readonly matchNumber: string;
}> {}

/** 指定された参加者がこの大会に無いことを表す。 */
export class DivisionParticipantNotFoundError extends Data.TaggedError(
  "DivisionParticipantNotFoundError",
)<{
  readonly participantId: string;
}> {}

/** results の楽観ロック（revision）が競合したことを表す。 */
export class DivisionRevisionConflictError extends Data.TaggedError(
  "DivisionRevisionConflictError",
)<{
  readonly divisionId: string;
}> {}

/** 対戦相手がまだ決まっていない試合に勝敗を入れようとしたことを表す。 */
export class DivisionSlotNotDecidedError extends Data.TaggedError(
  "DivisionSlotNotDecidedError",
)<{
  readonly matchId: string;
}> {}

export type DivisionError =
  | DivisionOrderConflictError
  | UnexpectedDivisionError
  | DivisionResultsRecordedError
  | DivisionNotEnoughEntriesError
  | DivisionDataError
  | DivisionEntryLimitError
  | DivisionDuplicateEntryError
  | DivisionMemberNotFoundError
  | DivisionMatchNotFoundError
  | DivisionMatchNumberConflictError
  | DivisionParticipantNotFoundError
  | DivisionRevisionConflictError
  | DivisionSlotNotDecidedError;

/**
 * DivisionError の全タグをコンパイラに列挙させるための対照表。
 * Record<DivisionError["_tag"], true> という型注釈により、union に
 * タグを追加してここへの追記を忘れるとコンパイルエラーになる（逆に
 * union に無いタグを書いてもコンパイルエラーになる）。instanceof の
 * 書き並べだと union とこの一覧が手作業のまま同期されるため、追記漏れが
 * 静かにコンパイルを通ってしまう。この対照表とその key 集合を判定に
 * 使うことで、union とタグ判定が構造的に乖離できないようにする。
 */
const divisionErrorTags: Record<DivisionError["_tag"], true> = {
  DivisionOrderConflictError: true,
  UnexpectedDivisionError: true,
  DivisionResultsRecordedError: true,
  DivisionNotEnoughEntriesError: true,
  DivisionDataError: true,
  DivisionEntryLimitError: true,
  DivisionDuplicateEntryError: true,
  DivisionMemberNotFoundError: true,
  DivisionMatchNotFoundError: true,
  DivisionMatchNumberConflictError: true,
  DivisionParticipantNotFoundError: true,
  DivisionRevisionConflictError: true,
  DivisionSlotNotDecidedError: true,
};

/**
 * reason が DivisionError のいずれかであるかを、_tag が
 * divisionErrorTags に載っているかどうかで判定する。instanceof を
 * 使わないのは、判定対象のタグ集合を divisionErrorTags（＝union から
 * コンパイラが強制した一覧）に一本化し、判定ロジックとタグ一覧が
 * ずれる余地を無くすため。
 *
 * `in` ではなく Object.hasOwn を使う。`in` はプロトタイプ鎖まで辿るため、
 * _tag が "toString" や "constructor" のオブジェクトが DivisionError と
 * 判定されてしまい、messages.ts の Match.exhaustive が文言を返せず
 * 実行時に落ちる。判定はこの対照表が自分で持つキーだけに限る。
 */
const isDivisionError = (reason: unknown): reason is DivisionError =>
  Predicate.isRecord(reason) &&
  Predicate.hasProperty(reason, "_tag") &&
  typeof reason._tag === "string" &&
  Object.hasOwn(divisionErrorTags, reason._tag);

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
  if (isDivisionError(reason)) {
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
