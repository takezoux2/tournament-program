import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import { resolveMemberId, resolveParticipantId } from "../entry-member";
import {
  DivisionDuplicateEntryError,
  type DivisionError,
  DivisionMatchNotFoundError,
} from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  firstRoundPairs,
  removeEntries,
  setFirstRoundSlot,
} from "../single-elimination/first-round";
import type { AssignSlotInput } from "./schema";

export type AssignSlotPort = (
  ids: DivisionIds,
  input: AssignSlotInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const assignSlotInDb: AssignSlotPort = (ids, input) =>
  runFirstRoundEdit<null>(ids, async (tx, current) => {
    // Member を作ってから試合が無いと分かると、トランザクションは巻き戻るが
    // 無駄な書き込みになる。先に試合の存在を確かめる。
    const exists = current.matchingConfig.matches.some(
      (match) =>
        match.bracket === "winners" &&
        match.round === 1 &&
        match.id === input.matchId,
    );
    if (!exists) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }

    const memberId = await resolveMemberId(
      tx,
      ids.organizationId,
      input.member,
    );
    const participantId = await resolveParticipantId(
      tx,
      ids.tournamentId,
      memberId,
    );

    // 同じ人が 2 つのスロットに居るとトーナメントが成り立たない。
    // 同じスロットに同じ人を選び直した場合も、エラーで知らせて何もしない。
    // スロットに置かれていないエントリー（試合の削除で外れたものや旧画面で
    // 登録したもの）はそのまま使い回し、エントリーを重複させない。
    const existing = current.entries.entries.find(
      (entry) => entry.participantId === participantId,
    );
    if (existing !== undefined) {
      const isPlaced = firstRoundPairs(current.matchingConfig).some((pair) =>
        pair.some(
          (slot) => slot.kind === "entry" && slot.entryId === existing.id,
        ),
      );
      if (isPlaced) {
        throw new DivisionDuplicateEntryError({ divisionId: ids.divisionId });
      }
    }

    const maxSeed = current.entries.entries.reduce(
      (max, entry) => Math.max(max, entry.seed),
      -1,
    );
    const entry = existing ?? {
      id: randomUUID(),
      participantId,
      seed: maxSeed + 1,
    };

    const placed = setFirstRoundSlot(
      current.matchingConfig,
      input.matchId,
      input.slotIndex,
      { kind: "entry", entryId: entry.id },
    );
    if (placed === null) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }

    const pushedOut =
      placed.replaced.kind === "entry" ? [placed.replaced.entryId] : [];
    const entries = removeEntries(
      {
        version: 1,
        entries:
          existing === undefined
            ? [...current.entries.entries, entry]
            : current.entries.entries,
      },
      pushedOut,
    );

    return {
      next: { format: current.format, entries, matchingConfig: placed.config },
      value: null,
    };
  });
