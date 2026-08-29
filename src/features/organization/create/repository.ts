import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationError, toOrganizationError } from "../errors";
import type { CreateOrganizationInput } from "./schema";

export type CreateOrganizationPort = (
  input: CreateOrganizationInput & { ownerUserId: string },
) => Effect.Effect<{ slug: string }, OrganizationError>;

export const createOrganizationInDb: CreateOrganizationPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.organization.create({
        // 組織と OWNER の所属行は必ず同時に作る。片方だけ作られると
        // 誰にも見えない組織が残る。nested write なら 1 クエリで原子的に入る。
        data: {
          name: input.name,
          slug: input.slug,
          users: { create: { userId: input.ownerUserId, role: "OWNER" } },
        },
        select: { slug: true },
      }),
    catch: (reason) => toOrganizationError(reason, input.slug),
  });
