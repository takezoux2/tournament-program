import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { CreateDivisionPort } from "./repository";
import type { CreateDivisionInput } from "./schema";

export const createDivision = (
  port: CreateDivisionPort,
  input: CreateDivisionInput,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ id: string } | null, DivisionError> =>
  port({ ...input, organizationId, tournamentId });
