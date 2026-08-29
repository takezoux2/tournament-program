import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationError, toOrganizationError } from "../errors";

export type UpdateOrganizationPort = (input: {
  organizationId: string;
  name: string;
}) => Effect.Effect<void, OrganizationError>;

export const updateOrganizationInDb: UpdateOrganizationPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      await prisma.organization.update({
        where: { id: input.organizationId },
        data: { name: input.name },
      });
    },
    // 組織名に unique 制約はないため P2002 は起きないが、写像は
    // 作成側と同じ関数を通しておく。slug は使われないので空文字を渡す。
    catch: (reason) => toOrganizationError(reason, ""),
  });
