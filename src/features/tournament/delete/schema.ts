import { z } from "zod";

export const deleteTournamentSchema = z.object({
  confirmName: z.string().transform((raw) => raw.trim()),
});

export type DeleteTournamentInput = z.infer<typeof deleteTournamentSchema>;
