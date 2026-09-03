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
    try: async () => {
      // 組織・作成者の所属行・その全権限は必ず同時に作る。途中で切れると
      // 誰も操作できない組織が残る。1 トランザクションにまとめて原子的に入れる。
      const permissions = await prisma.permission.findMany({
        select: { id: true },
      });

      return prisma.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          users: {
            create: {
              userId: input.ownerUserId,
              // 作成者は組織を運営できなければ意味がないため全権限を持たせる。
              permissions: {
                create: permissions.map((permission) => ({
                  permissionId: permission.id,
                })),
              },
            },
          },
        },
        select: { slug: true },
      });
    },
    catch: (reason) => toOrganizationError(reason, input.slug),
  });
