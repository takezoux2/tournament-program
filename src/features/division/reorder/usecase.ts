import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { ReorderDirection } from "./domain";
import type { ReorderDivisionPort } from "./repository";

export const reorderDivision = (
  port: ReorderDivisionPort,
  organizationId: string,
  tournamentId: string,
  divisionId: string,
  direction: ReorderDirection,
): Effect.Effect<{ swapped: boolean }, DivisionError> =>
  port({ organizationId, tournamentId, divisionId, direction });
