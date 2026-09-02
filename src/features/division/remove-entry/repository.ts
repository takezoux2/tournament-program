import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";
import type { RemoveEntryInput } from "./schema";

export type RemoveEntryPort = (
  ids: DivisionIds,
  input: RemoveEntryInput,
) => Effect.Effect<
  DivisionSetupOutcome<{ regenerated: boolean }>,
  DivisionError
>;

export const removeEntryInDb: RemoveEntryPort = (ids, input) =>
  runDivisionSetup<{ regenerated: boolean }>(ids, async (_tx, current) => {
    const remaining = current.entries.entries.filter(
      (entry) => entry.id !== input.entryId,
    );

    // 減っていなければ対象が無かったということ。存在を漏らさないため
    // エラーにせず、何も起きなかったものとして返す。
    if (remaining.length === current.entries.entries.length) {
      return { next: null, value: { regenerated: false } };
    }

    const entries: DivisionEntries = {
      version: 1,
      entries: [...remaining]
        .sort((left, right) => left.seed - right.seed)
        .map((entry, index) => ({ ...entry, seed: index })),
    };

    // 穴を bye として残すより、シード順から作り直した方が結果が読みやすい。
    // 手動で入れ替えた配置はここで失われるので、画面には再生成した旨を出す。
    const regenerated = current.matchingConfig.matches.length > 0;
    const matchingConfig = regenerated
      ? buildFromSlots(generateSlots(entries.entries))
      : current.matchingConfig;

    return { next: { entries, matchingConfig }, value: { regenerated } };
  });
