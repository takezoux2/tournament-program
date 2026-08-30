import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationError, toOrganizationError } from "../errors";

export type UpdateOrganizationPort = (input: {
  organizationId: string;
  name: string;
}) => Effect.Effect<{ updated: number }, OrganizationError>;

export const updateOrganizationInDb: UpdateOrganizationPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany を使うのは件数を取るため。update だと対象が消えていた場合に
      // P2025 の例外になり、tournament 側（updateMany の 0 件）と扱いが割れてしまう。
      const result = await prisma.organization.updateMany({
        where: { id: input.organizationId },
        data: { name: input.name },
      });
      return { updated: result.count };
    },
    // 組織名に unique 制約はないため P2002 は起きないが、写像は
    // 作成側と同じ関数を通しておく。slug は使われないので空文字を渡す。
    catch: (reason) => toOrganizationError(reason, ""),
  });
