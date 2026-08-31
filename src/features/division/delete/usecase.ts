import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DeleteDivisionPort } from "./repository";

export const deleteDivision = (
  port: DeleteDivisionPort,
  organizationId: string,
  tournamentId: string,
  divisionId: string,
): Effect.Effect<{ deleted: number }, DivisionError> =>
  port({ organizationId, tournamentId, divisionId });
