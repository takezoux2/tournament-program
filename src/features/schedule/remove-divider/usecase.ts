import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { RemoveDividerPort } from "./repository";
import type { RemoveDividerInput } from "./schema";

export const removeDivider = (
  port: RemoveDividerPort,
  ids: ScheduleIds,
  input: RemoveDividerInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
