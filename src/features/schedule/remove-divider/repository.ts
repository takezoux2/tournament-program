import "server-only";
import type { Effect } from "effect";
import { removeDividerRow } from "../domain";
import { type ScheduleError, ScheduleItemNotFoundError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import type { RemoveDividerInput } from "./schema";

export type RemoveDividerPort = (
  ids: ScheduleIds,
  input: RemoveDividerInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * 区切りを 1 つ取り除く。残りの行は詰めて order を振り直す（store の save）。
 * 対象が無い場合は「見つからない」として扱う。
 */
export const removeDividerInDb: RemoveDividerPort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = removeDividerRow(rows, input.itemId);
    if (next === null) {
      throw new ScheduleItemNotFoundError({ itemId: input.itemId });
    }
    return { next, value: null };
  });
