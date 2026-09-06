import "server-only";
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots, toSlots } from "../single-elimination/build";
import { swapSlots } from "../single-elimination/edit";
import type { SwapSlotsInput } from "./schema";

export type SwapSlotsPort = (
  ids: DivisionIds,
  input: SwapSlotsInput,
) => Effect.Effect<DivisionSetupOutcome<{ swapped: boolean }>, DivisionError>;

export const swapSlotsInDb: SwapSlotsPort = (ids, input) =>
  runDivisionSetup<{ swapped: boolean }>(ids, async (_tx, current) => {
    // 1 回戦スロットの入れ替えは勝ち上がり木にしか意味が無い。
    // setup-store は編集画面を持つ 2 形式を通すので、ここで絞る。
    // 存在を漏らさないため、対象外の形式は「その部門は無い」と同じに倒す。
    if (current.format !== "SINGLE_ELIMINATION") {
      return { next: null, value: { swapped: false } };
    }

    const slots = swapSlots(
      toSlots(current.matchingConfig),
      input.indexA,
      input.indexB,
    );

    // null は「入れ替えられない指定だった」。画面上は何も起きなかったのと同じで、
    // 存在を漏らさないためにもエラーにはしない。
    if (slots === null) {
      return { next: null, value: { swapped: false } };
    }

    return {
      next: {
        format: current.format,
        entries: current.entries,
        matchingConfig: buildFromSlots(slots),
      },
      value: { swapped: true },
    };
  });
