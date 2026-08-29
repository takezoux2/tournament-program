import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

export class SlugTaken extends Data.TaggedError("SlugTaken")<{
  readonly slug: string;
}> {}

export class UnexpectedOrganizationError extends Data.TaggedError(
  "UnexpectedOrganizationError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type OrganizationError = SlugTaken | UnexpectedOrganizationError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toOrganizationError = (
  reason: unknown,
  slug: string,
): OrganizationError => {
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new SlugTaken({ slug });
  }
  return new UnexpectedOrganizationError({ reason });
};
