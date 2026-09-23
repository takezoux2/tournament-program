import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import { parseMatchingConfig } from "@/lib/division/parse";
import type { DivisionEntry, EntrySource } from "@/lib/division/types";
import { resolveMemberId, resolveParticipantId } from "../entry-member";
import {
  DivisionDuplicateEntryError,
  DivisionEntrySourceInvalidError,
  type DivisionError,
  DivisionMatchNotFoundError,
} from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type {
  DivisionIds,
  DivisionSetupOutcome,
  DivisionSetupTx,
} from "../setup-store";
import {
  firstRoundPairs,
  removeEntries,
  setFirstRoundSlot,
} from "../single-elimination/first-round";
import type { AssignSlotInput, SlotOccupantInput } from "./schema";

export type AssignSlotPort = (
  ids: DivisionIds,
  input: AssignSlotInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/** 同じ参照を指しているか。同じ枠を 2 つ置かせないための比較。 */
const sameSource = (left: EntrySource, right: EntrySource): boolean => {
  if (left.kind !== right.kind || left.divisionId !== right.divisionId) {
    return false;
  }
  if (left.kind === "leagueRank" && right.kind === "leagueRank") {
    return left.rank === right.rank;
  }
  if (left.kind !== "leagueRank" && right.kind !== "leagueRank") {
    return left.matchId === right.matchId;
  }
  return false;
};

/**
 * 参照先が使えるものかを確かめて EntrySource にする。
 *
 * 画面は選択肢を絞るが、Server Action は直接叩ける別の入口なのでここでも見る。
 * 見るのは「同じ大会にある」「自部門ではない」「順位はリーグだけ」「試合が
 * 実在する」の 4 つ。結果が出ているかは見ない（未確定のまま置けるのが目的）。
 */
const toEntrySource = async (
  tx: DivisionSetupTx,
  ids: DivisionIds,
  occupant: Extract<
    SlotOccupantInput,
    { mode: "matchResult" } | { mode: "leagueRank" }
  >,
): Promise<EntrySource> => {
  if (occupant.sourceDivisionId === ids.divisionId) {
    throw new DivisionEntrySourceInvalidError({ reason: "sameDivision" });
  }
  const target = await tx.division.findFirst({
    where: { id: occupant.sourceDivisionId, tournamentId: ids.tournamentId },
    select: { id: true, format: true, matchingConfig: true },
  });
  if (target === null) {
    throw new DivisionEntrySourceInvalidError({ reason: "notFound" });
  }

  if (occupant.mode === "leagueRank") {
    if (target.format !== "ROUND_ROBIN") {
      throw new DivisionEntrySourceInvalidError({ reason: "notLeague" });
    }
    return { kind: "leagueRank", divisionId: target.id, rank: occupant.rank };
  }

  // 試合の実在だけを確かめる。壊れた Json は DivisionJsonError から
  // DivisionDataError に写像される（errors.ts の toDivisionError）。
  const hasMatch = parseMatchingConfig(target.matchingConfig).matches.some(
    (match) => match.id === occupant.sourceMatchId,
  );
  if (!hasMatch) {
    throw new DivisionEntrySourceInvalidError({ reason: "matchNotFound" });
  }
  return {
    kind: occupant.outcome === "winner" ? "matchWinner" : "matchLoser",
    divisionId: target.id,
    matchId: occupant.sourceMatchId,
  };
};

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

    // 同じ人・同じ参照が 2 つのスロットに居るとトーナメントが成り立たない。
    // 同じスロットに同じものを選び直した場合も、エラーで知らせて何もしない。
    // スロットに置かれていないエントリー（試合の削除で外れたものや旧画面で
    // 登録したもの）はそのまま使い回し、エントリーを重複させない。
    const rejectIfPlaced = (candidate: DivisionEntry | undefined): void => {
      if (candidate === undefined) {
        return;
      }
      const isPlaced = firstRoundPairs(current.matchingConfig).some((pair) =>
        pair.some(
          (slot) => slot.kind === "entry" && slot.entryId === candidate.id,
        ),
      );
      if (isPlaced) {
        throw new DivisionDuplicateEntryError({ divisionId: ids.divisionId });
      }
    };

    const maxSeed = current.entries.entries.reduce(
      (max, entry) => Math.max(max, entry.seed),
      -1,
    );

    let entry: DivisionEntry;
    let reused: boolean;
    if (input.occupant.mode === "existing" || input.occupant.mode === "new") {
      const memberId = await resolveMemberId(
        tx,
        ids.organizationId,
        input.occupant,
      );
      const participantId = await resolveParticipantId(
        tx,
        ids.tournamentId,
        memberId,
      );
      const found = current.entries.entries.find(
        (item) => item.participantId === participantId,
      );
      rejectIfPlaced(found);
      entry = found ?? { id: randomUUID(), participantId, seed: maxSeed + 1 };
      reused = found !== undefined;
    } else {
      const source = await toEntrySource(tx, ids, input.occupant);
      const found = current.entries.entries.find(
        (item) => item.source !== undefined && sameSource(item.source, source),
      );
      rejectIfPlaced(found);
      entry = found ?? { id: randomUUID(), seed: maxSeed + 1, source };
      reused = found !== undefined;
    }

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
        entries: reused
          ? current.entries.entries
          : [...current.entries.entries, entry],
      },
      pushedOut,
    );

    return {
      next: { format: current.format, entries, matchingConfig: placed.config },
      value: null,
    };
  });
