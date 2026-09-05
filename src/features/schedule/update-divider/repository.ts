import "server-only";
import type { Effect } from "effect";
import { updateDividerRow } from "../domain";
import { type ScheduleError, ScheduleItemNotFoundError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import type { UpdateDividerInput } from "./schema";

export type UpdateDividerPort = (
  ids: ScheduleIds,
  input: UpdateDividerInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * 区切りのラベルと開始予定時刻を差し替える。並びは変えない。
 * 対象が無い（消えている、または試合行の id を指している）場合は
 * 「見つからない」として扱う。
 */
export const updateDividerInDb: UpdateDividerPort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = updateDividerRow(
      rows,
      input.itemId,
      input.label,
      input.startsAt,
    );
    if (next === null) {
      throw new ScheduleItemNotFoundError({ itemId: input.itemId });
    }
    return { next, value: null };
  });
