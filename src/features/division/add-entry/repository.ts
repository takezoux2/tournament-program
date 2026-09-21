import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import { resolveMemberId, resolveParticipantId } from "../entry-member";
import {
  DivisionDuplicateEntryError,
  DivisionEntryLimitError,
  type DivisionError,
} from "../errors";
import { applyEntryAdded, maxEntries } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import type { AddEntryInput } from "./schema";

/**
 * 追加の結果。組み合わせを作り直したかどうかを分けて返すのは、
 * 画面の通知が事実とずれないようにするため。reorder-entry と同じ理由。
 */
export type AddEntryResult = { regenerated: boolean };

export type AddEntryPort = (
  ids: DivisionIds,
  input: AddEntryInput,
) => Effect.Effect<DivisionSetupOutcome<AddEntryResult>, DivisionError>;

export const addEntryInDb: AddEntryPort = (ids, input) =>
  runDivisionSetup<AddEntryResult>(ids, async (tx, current) => {
    // シングルエリミは 1 回戦の試合・スロットを直接編集するスライス
    // （add-first-round-match など）で組む。ここで木を組み直すと 2 の冪へ
    // 詰め直され、試合名も消えるため、この経路では何もしない。
    if (current.format === "SINGLE_ELIMINATION") {
      return { next: null, value: { regenerated: false } };
    }

    const limit = maxEntries(current.format);
    if (current.entries.entries.length >= limit) {
      throw new DivisionEntryLimitError({ divisionId: ids.divisionId, limit });
    }

    const memberId = await resolveMemberId(tx, ids.organizationId, input);
    const participantId = await resolveParticipantId(
      tx,
      ids.tournamentId,
      memberId,
    );

    if (
      current.entries.entries.some(
        (entry) => entry.participantId === participantId,
      )
    ) {
      throw new DivisionDuplicateEntryError({ divisionId: ids.divisionId });
    }

    const maxSeed = current.entries.entries.reduce(
      (max, entry) => Math.max(max, entry.seed),
      -1,
    );
    const added = { id: randomUUID(), participantId, seed: maxSeed + 1 };

    const entries: DivisionEntries = {
      version: 1,
      entries: [...current.entries.entries, added],
    };

    // 組み合わせが未作成なら空のまま。生成は運営者が押したときだけ起きる。
    const matchingConfig = applyEntryAdded(
      current.format,
      current.matchingConfig,
      entries.entries,
      added.id,
    );

    return {
      next: { format: current.format, entries, matchingConfig },
      value: {
        // applyEntryAdded は作り直さなかったとき current.matchingConfig を
        // そのまま返す（参照が同じ）。reorder-entry/repository.ts と同じ
        // 判別方法。
        regenerated: matchingConfig !== current.matchingConfig,
      },
    };
  });
