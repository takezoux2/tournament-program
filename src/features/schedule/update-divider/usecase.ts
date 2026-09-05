import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { UpdateDividerPort } from "./repository";
import type { UpdateDividerInput } from "./schema";

export const updateDivider = (
  port: UpdateDividerPort,
  ids: ScheduleIds,
  input: UpdateDividerInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
