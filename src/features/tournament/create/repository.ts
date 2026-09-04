import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TournamentError, toTournamentError } from "../errors";
import type { CreateTournamentInput } from "./schema";

export type CreateTournamentPort = (
  input: CreateTournamentInput & { organizationId: string },
) => Effect.Effect<{ id: string }, TournamentError>;

export const createTournamentInDb: CreateTournamentPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.tournament.create({
        // status は既定の DRAFT のまま。遷移は結果入力機能と一緒に設計する。
        data: {
          organizationId: input.organizationId,
          name: input.name,
          startsAt: input.startsAt,
          description: input.description,
        },
        select: { id: true },
      }),
    catch: toTournamentError,
  });
