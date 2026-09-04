import { z } from "zod";
import {
  startsAtSchema,
  tournamentDescriptionSchema,
  tournamentNameSchema,
} from "../schema-parts";

export const createTournamentSchema = z.object({
  name: tournamentNameSchema,
  startsAt: startsAtSchema,
  description: tournamentDescriptionSchema,
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
