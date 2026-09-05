import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import { insertDividerAfter } from "../domain";
import { type ScheduleError, ScheduleStaleError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import { DEFAULT_DIVIDER_LABEL, type InsertDividerInput } from "./schema";

export type InsertDividerPort = (
  ids: ScheduleIds,
  input: InsertDividerInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * アンカーの直後（HEAD_ANCHOR_KEY なら先頭）へ区切りを挿す。
 * id の採番はここで行い、domain 側は純粋関数のままにする。
 * アンカーが今の一覧に無いのは画面が古いということなので、reorder と同じく
 * ScheduleStaleError にして再読み込みを促す。
 */
export const insertDividerInDb: InsertDividerPort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = insertDividerAfter(rows, input.anchorKey, {
      id: randomUUID(),
      label: DEFAULT_DIVIDER_LABEL,
      startsAt: null,
    });
    if (next === null) {
      throw new ScheduleStaleError({ tournamentId: ids.tournamentId });
    }
    return { next, value: null };
  });
