import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionMatchNotFoundError } from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  removeEntries,
  removeFirstRoundMatch,
} from "../single-elimination/first-round";
import type { RemoveFirstRoundMatchInput } from "./schema";

export type RemoveFirstRoundMatchPort = (
  ids: DivisionIds,
  input: RemoveFirstRoundMatchInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const removeFirstRoundMatchInDb: RemoveFirstRoundMatchPort = (
  ids,
  input,
) =>
  runFirstRoundEdit<null>(ids, async (_tx, current) => {
    const removed = removeFirstRoundMatch(
      current.matchingConfig,
      input.matchId,
    );
    // 画面が古いと、もう無い試合を指してくる。黙って成功にすると
    // 運営者は消えたと思い込むので、再読み込みを促す。
    if (removed === null) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }
    return {
      next: {
        format: current.format,
        entries: removeEntries(current.entries, removed.removedEntryIds),
        matchingConfig: removed.config,
      },
      value: null,
    };
  });
