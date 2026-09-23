import "server-only";
import { Effect } from "effect";
import { type DivisionError, DivisionShapeMismatchError } from "./errors";
import {
  type DivisionIds,
  type DivisionSetup,
  type DivisionSetupOutcome,
  type DivisionSetupTx,
  runDivisionSetup,
} from "./setup-store";
import { isSingleEliminationShape } from "./single-elimination/build";

type Applicable<T> = { applicable: false } | { applicable: true; value: T };

/**
 * 1 回戦を直接編集する 4 スライスが共有する入口。runDivisionSetup の
 * トランザクション・結果ロック・保存前検証に、次の 2 つを足す。
 *
 * - SINGLE_ELIMINATION 以外は「その部門は無い」と同じ found: false に倒す。
 * - トーナメントの形でない組み合わせは部分編集させない（league の星取表を
 *   1 回戦だけ取り出して組み直すと 2 節目以降が消える）。
 */
export const runFirstRoundEdit = <T>(
  ids: DivisionIds,
  mutate: (
    tx: DivisionSetupTx,
    current: DivisionSetup,
  ) => Promise<{ next: DivisionSetup | null; value: T }>,
): Effect.Effect<DivisionSetupOutcome<T>, DivisionError> =>
  runDivisionSetup<Applicable<T>>(ids, async (tx, current) => {
    if (current.format !== "SINGLE_ELIMINATION") {
      return { next: null, value: { applicable: false } };
    }
    if (!isSingleEliminationShape(current.matchingConfig)) {
      throw new DivisionShapeMismatchError({ divisionId: ids.divisionId });
    }
    const { next, value } = await mutate(tx, current);
    return { next, value: { applicable: true, value } };
  }).pipe(
    Effect.map(
      (outcome): DivisionSetupOutcome<T> =>
        outcome.found && outcome.value.applicable
          ? { found: true, value: outcome.value.value }
          : { found: false },
    ),
  );
