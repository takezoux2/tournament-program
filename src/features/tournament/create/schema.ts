import { z } from "zod";
import { startsAtSchema, tournamentNameSchema } from "../schema-parts";

export const createTournamentSchema = z.object({
  name: tournamentNameSchema,
  startsAt: startsAtSchema,
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
