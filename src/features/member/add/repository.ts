import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type MemberError, UnexpectedMemberError } from "../errors";
import type { AddMemberInput } from "./schema";

export type AddMemberPort = (
  input: AddMemberInput & { organizationId: string },
) => Effect.Effect<void, MemberError>;

export const addMemberInDb: AddMemberPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // Member に一意制約は無いため衝突エラーは起きない。実在の同姓同名を
      // 排除できないので、重複チェックは意図的にしない（設計どおり）。
      await prisma.member.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          nameKana: input.nameKana,
        },
        select: { id: true },
      });
    },
    catch: (reason) => new UnexpectedMemberError({ reason }),
  });
