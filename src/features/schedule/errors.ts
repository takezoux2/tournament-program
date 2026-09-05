import { Data, Predicate } from "effect";
import { Prisma } from "@/generated/prisma/client";
import { DivisionJsonError } from "@/lib/division/parse";

/**
 * 画面が持っていた並びが、いまの一覧と一致しないことを表す。
 * 別の誰かが組み合わせを作り直した・区切りを増やした場合に起きる。
 * この確認が同時編集に対する防波堤なので、リビジョン列は持たない。
 */
export class ScheduleStaleError extends Data.TaggedError("ScheduleStaleError")<{
  readonly tournamentId: string;
}> {}

/** 指定された区切りが無い（または対象が区切りでない）ことを表す。 */
export class ScheduleItemNotFoundError extends Data.TaggedError(
  "ScheduleItemNotFoundError",
)<{
  readonly itemId: string;
}> {}

/** DB の Json / 行が想定の形をしていないことを表す。 */
export class ScheduleDataError extends Data.TaggedError("ScheduleDataError")<{
  readonly reason: unknown;
}> {}

/** order の unique 制約（@@unique([tournamentId, order])）に触れたことを表す。 */
export class ScheduleOrderConflictError extends Data.TaggedError(
  "ScheduleOrderConflictError",
)<{
  readonly tournamentId: string;
}> {}

export class UnexpectedScheduleError extends Data.TaggedError(
  "UnexpectedScheduleError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type ScheduleError =
  | ScheduleStaleError
  | ScheduleItemNotFoundError
  | ScheduleDataError
  | ScheduleOrderConflictError
  | UnexpectedScheduleError;

/**
 * ScheduleError の全タグをコンパイラに列挙させるための対照表。
 * union にタグを足してここへの追記を忘れるとコンパイルエラーになる。
 * features/division/errors.ts と同じ作りにしてある。
 */
const scheduleErrorTags: Record<ScheduleError["_tag"], true> = {
  ScheduleStaleError: true,
  ScheduleItemNotFoundError: true,
  ScheduleDataError: true,
  ScheduleOrderConflictError: true,
  UnexpectedScheduleError: true,
};

/**
 * `in` ではなく Object.hasOwn を使う。`in` はプロトタイプ鎖まで辿るため、
 * _tag が "toString" のオブジェクトが ScheduleError と判定され、
 * messages.ts の Match.exhaustive が文言を返せず実行時に落ちる。
 */
const isScheduleError = (reason: unknown): reason is ScheduleError =>
  Predicate.isRecord(reason) &&
  Predicate.hasProperty(reason, "_tag") &&
  typeof reason._tag === "string" &&
  Object.hasOwn(scheduleErrorTags, reason._tag);

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toScheduleError = (
  reason: unknown,
  tournamentId: string,
): ScheduleError => {
  // トランザクションの中から投げたドメインエラーはそのまま通す。
  if (isScheduleError(reason)) {
    return reason;
  }
  if (reason instanceof DivisionJsonError) {
    return new ScheduleDataError({ reason });
  }
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new ScheduleOrderConflictError({ tournamentId });
  }
  return new UnexpectedScheduleError({ reason });
};
