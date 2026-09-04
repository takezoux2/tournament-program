import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type MemberError, toMemberError } from "../errors";

export type RemoveMemberPort = (input: {
  memberId: string;
  organizationId: string;
}) => Effect.Effect<{ removed: number }, MemberError>;

/**
 * 参加記録の有無は事前に数えず、FK（onDelete: Restrict）の P2003 を
 * toMemberError で MemberHasParticipants に写す。削除と判定が原子的になる。
 */
export const removeMemberInDb: RemoveMemberPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // deleteMany を使うのは、所有権を where に残したまま件数を取るため。
      const result = await prisma.member.deleteMany({
        where: { organizationId: input.organizationId, id: input.memberId },
      });
      return { removed: result.count };
    },
    catch: (reason) => toMemberError(reason, input.memberId),
  });
