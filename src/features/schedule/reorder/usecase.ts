import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { ReorderSchedulePort } from "./repository";
import type { ReorderScheduleInput } from "./schema";

export const reorderSchedule = (
  port: ReorderSchedulePort,
  ids: ScheduleIds,
  input: ReorderScheduleInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
