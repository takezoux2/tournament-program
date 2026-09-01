import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { UpdateDivisionPort } from "./repository";
import type { UpdateDivisionInput } from "./schema";

export const updateDivision = (
  port: UpdateDivisionPort,
  input: UpdateDivisionInput,
  organizationId: string,
  tournamentId: string,
  divisionId: string,
): Effect.Effect<{ updated: number }, DivisionError> =>
  port({
    organizationId,
    tournamentId,
    divisionId,
    name: input.name,
    format: input.format,
  });
