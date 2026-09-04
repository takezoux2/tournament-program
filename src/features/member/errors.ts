import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

/** 対象メンバーがこの組織に居ない（他組織の ID・削除済み ID を含む）。 */
export class MemberNotFound extends Data.TaggedError("MemberNotFound")<{
  readonly memberId: string;
}> {}

/**
 * 大会への参加記録（Participant）が残っている。Participant → Member は
 * onDelete: Restrict なので、削除は FK 違反で止まる。
 */
export class MemberHasParticipants extends Data.TaggedError(
  "MemberHasParticipants",
)<{
  readonly memberId: string;
}> {}

export class UnexpectedMemberError extends Data.TaggedError(
  "UnexpectedMemberError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type MemberError =
  | MemberNotFound
  | MemberHasParticipants
  | UnexpectedMemberError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toMemberError = (
  reason: unknown,
  memberId: string,
): MemberError => {
  if (reason instanceof Prisma.PrismaClientKnownRequestError) {
    if (reason.code === "P2003") {
      // Member を参照する外部キーは Participant だけ。
      return new MemberHasParticipants({ memberId });
    }
  }
  return new UnexpectedMemberError({ reason });
};
