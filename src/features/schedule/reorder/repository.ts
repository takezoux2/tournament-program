import "server-only";
import type { Effect } from "effect";
import { reorderRows } from "../domain";
import { type ScheduleError, ScheduleStaleError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import type { ReorderScheduleInput } from "./schema";

export type ReorderSchedulePort = (
  ids: ScheduleIds,
  input: ReorderScheduleInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * 送られたキー順に並べ替える。キー集合が現在の一覧と一致しない場合は
 * 受け付けない。別の誰かが組み合わせを作り直した・区切りを増やした場合に
 * 起きるので、画面の再読み込みを促す。この確認自体が同時編集の防波堤で、
 * リビジョン列は持たない。
 */
export const reorderScheduleInDb: ReorderSchedulePort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = reorderRows(rows, input.keys);
    if (next === null) {
      throw new ScheduleStaleError({ tournamentId: ids.tournamentId });
    }
    return { next, value: null };
  });
