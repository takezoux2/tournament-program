import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { InsertDividerPort } from "./repository";
import type { InsertDividerInput } from "./schema";

export const insertDivider = (
  port: InsertDividerPort,
  ids: ScheduleIds,
  input: InsertDividerInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
