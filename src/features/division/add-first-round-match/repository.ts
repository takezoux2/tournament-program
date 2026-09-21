import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionFirstRoundLimitError } from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  addFirstRoundMatch,
  firstRoundPairs,
  MAX_FIRST_ROUND_MATCHES,
} from "../single-elimination/first-round";

export type AddFirstRoundMatchPort = (
  ids: DivisionIds,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const addFirstRoundMatchInDb: AddFirstRoundMatchPort = (ids) =>
  runFirstRoundEdit<null>(ids, async (_tx, current) => {
    if (
      firstRoundPairs(current.matchingConfig).length >= MAX_FIRST_ROUND_MATCHES
    ) {
      throw new DivisionFirstRoundLimitError({
        divisionId: ids.divisionId,
        limit: MAX_FIRST_ROUND_MATCHES,
      });
    }
    return {
      next: {
        ...current,
        matchingConfig: addFirstRoundMatch(current.matchingConfig),
      },
      value: null,
    };
  });
