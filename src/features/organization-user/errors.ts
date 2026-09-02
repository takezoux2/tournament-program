import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

/** 検索で該当ユーザーが見つからない、または追加直前に消えていた。 */
export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly query: string;
}> {}

/** 既にこの組織に所属している。 */
export class AlreadyMember extends Data.TaggedError("AlreadyMember")<{
  readonly userId: string;
}> {}

/** 対象がこの組織に所属していない（権限編集・削除の対象違い）。 */
export class NotAMember extends Data.TaggedError("NotAMember")<{
  readonly userId: string;
}> {}

export class UnexpectedOrganizationUserError extends Data.TaggedError(
  "UnexpectedOrganizationUserError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type OrganizationUserError =
  | UserNotFound
  | AlreadyMember
  | NotAMember
  | UnexpectedOrganizationUserError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 *
 * targetId は操作対象を指す文字列。追加・削除・権限編集では User.id が、
 * 検索では入力された検索語が渡る。エラーに載せて画面や調査で辿れるようにするだけで、
 * 分岐には使わない。
 */
export const toOrganizationUserError = (
  reason: unknown,
  targetId: string,
): OrganizationUserError => {
  if (reason instanceof Prisma.PrismaClientKnownRequestError) {
    if (reason.code === "P2002") {
      return new AlreadyMember({ userId: targetId });
    }
    if (reason.code === "P2003") {
      // 外部キー違反は、追加しようとした先のユーザーか組織が消えたことを意味する。
      return new UserNotFound({ query: targetId });
    }
  }
  return new UnexpectedOrganizationUserError({ reason });
};
