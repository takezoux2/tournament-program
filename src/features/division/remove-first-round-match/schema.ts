import { z } from "zod";
import { matchIdSchema } from "../first-round-schema";

export const removeFirstRoundMatchSchema = z.object({ matchId: matchIdSchema });

export type RemoveFirstRoundMatchInput = z.infer<
  typeof removeFirstRoundMatchSchema
>;
