import "server-only";
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import {
  buildSlotBracket,
  isSlotBracketFormat,
  matchesSlotBracketShape,
} from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { toSlots } from "../single-elimination/build";
import { swapSlots } from "../single-elimination/edit";
import type { SwapSlotsInput } from "./schema";

export type SwapSlotsPort = (
  ids: DivisionIds,
  input: SwapSlotsInput,
) => Effect.Effect<DivisionSetupOutcome<{ swapped: boolean }>, DivisionError>;

export const swapSlotsInDb: SwapSlotsPort = (ids, input) =>
  runDivisionSetup<{ swapped: boolean }>(ids, async (_tx, current) => {
    const format = current.format;
    // 1 回戦スロットの入れ替えはスロット型ブラケットにしか意味が無い。
    // 存在を漏らさないため、対象外の形式は「その部門は無い」と同じに倒す。
    if (!isSlotBracketFormat(format)) {
      return { next: null, value: { swapped: false } };
    }

    // /edit は format を無条件に書き換えられるため、リーグの星取表を
    // 持ったままスロット型ブラケットになった部門が存在しうる。その星取表は
    // toSlots で 1 回戦だけ取り出して build に通すと 2 節目以降が
    // 消える（奇数人なら休みの 1 人がそのまま行方不明になる）。存在を
    // 漏らさないため、ここも「入れ替えられない」と同じ応答に倒す。
    if (!matchesSlotBracketShape(format, current.matchingConfig)) {
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
        format,
        entries: current.entries,
        matchingConfig: buildSlotBracket(format, slots),
      },
      value: { swapped: true },
    };
  });
