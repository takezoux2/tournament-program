import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

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

export type DivisionError =
  | DivisionOrderConflictError
  | UnexpectedDivisionError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toDivisionError = (
  reason: unknown,
  tournamentId: string,
): DivisionError => {
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new DivisionOrderConflictError({ tournamentId });
  }
  return new UnexpectedDivisionError({ reason });
};
