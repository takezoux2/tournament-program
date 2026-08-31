import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";
import type { CreateDivisionInput } from "./schema";

/** null は「この組織にその大会が無い」。呼び出し側は notFound() に倒す。 */
export type CreateDivisionPort = (
  input: CreateDivisionInput & {
    organizationId: string;
    tournamentId: string;
  },
) => Effect.Effect<{ id: string } | null, DivisionError>;

export const createDivisionInDb: CreateDivisionPort = (input) =>
  Effect.tryPromise({
    try: () =>
      // 採番（max+1）と作成を 1 つのトランザクションに入れる。分けると、
      // 間に別の作成が挟まったときに同じ order を 2 件が掴む窓が広がる。
      prisma.$transaction(async (tx) => {
        // create は where を持てないので、所有権はここで別途確かめる。
        const tournament = await tx.tournament.findFirst({
          where: {
            id: input.tournamentId,
            organizationId: input.organizationId,
          },
          select: { id: true },
        });
        if (!tournament) {
          return null;
        }

        const aggregate = await tx.division.aggregate({
          where: { tournamentId: input.tournamentId },
          _max: { order: true },
        });

        const created = await tx.division.create({
          data: {
            tournamentId: input.tournamentId,
            name: input.name,
            format: input.format,
            // 0 件なら null が返る。+1 して 0 始まりにする。
            order: (aggregate._max.order ?? -1) + 1,
          },
          select: { id: true },
        });

        return { id: created.id };
      }),
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
