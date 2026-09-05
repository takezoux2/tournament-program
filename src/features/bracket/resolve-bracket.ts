import type {
  Bracket,
  MatchResult,
  MatchStatus,
  Participant,
  ResolvedMatch,
  ResolvedSlot,
  SlotSource,
} from "./types";

/**
 * 参加者・ブラケット構造・勝敗の 3 データを突き合わせ、描画可能な形へ畳み込む。
 * ラウンド昇順に走査することで、前ラウンドの勝者を 1 パスで次ラウンドへ伝播できる。
 */
export function resolveBracket(
  participants: Participant[],
  bracket: Bracket,
  results: MatchResult[],
): ResolvedMatch[] {
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const resultByMatchId = new Map(results.map((r) => [r.matchId, r]));
  const matchIds = new Set(bracket.matches.map((m) => m.id));
  const winnerByMatchId = new Map<string, string>();

  const ordered = [...bracket.matches].sort(
    (a, b) => a.round - b.round || a.order - b.order,
  );

  return ordered.map((match) => {
    const slots: [ResolvedSlot, ResolvedSlot] = [
      resolveSlot(match.slots[0], participantById, matchIds, winnerByMatchId),
      resolveSlot(match.slots[1], participantById, matchIds, winnerByMatchId),
    ];
    const sourceMatchIds: [string | null, string | null] = [
      sourceMatchId(match.slots[0]),
      sourceMatchId(match.slots[1]),
    ];

    const hasBye = match.slots.some((slot) => slot.kind === "bye");
    const result = resultByMatchId.get(match.id);

    let winnerId: string | null = null;
    let score: string | null = null;

    if (hasBye) {
      // BYE の相手は結果がなくても自動的に勝ち上がる
      winnerId =
        slots.find((slot) => slot.state === "confirmed")?.participant?.id ??
        null;
      if (result) {
        if (result.winnerId !== winnerId) {
          throw new Error(
            `Match "${match.id}" is a BYE auto-advancing "${winnerId}", but its result names conflicting winnerId "${result.winnerId}"`,
          );
        }
        score = result.score ?? null;
      }
    } else if (result) {
      winnerId = result.winnerId;
      score = result.score ?? null;
    }

    if (winnerId !== null) {
      if (!slots.some((slot) => slot.participant?.id === winnerId)) {
        throw new Error(
          `Match "${match.id}" has winnerId "${winnerId}" that is in neither slot`,
        );
      }
      winnerByMatchId.set(match.id, winnerId);
      for (const slot of slots) {
        slot.isWinner = slot.participant?.id === winnerId;
      }
    }

    return {
      id: match.id,
      round: match.round,
      order: match.order,
      matchNumber: match.matchNumber ?? null,
      slots,
      winnerId,
      score,
      status: toStatus(hasBye, winnerId, slots),
      sourceMatchIds,
    };
  });
}

function resolveSlot(
  source: SlotSource,
  participantById: Map<string, Participant>,
  matchIds: Set<string>,
  winnerByMatchId: Map<string, string>,
): ResolvedSlot {
  if (source.kind === "bye") {
    return { participant: null, state: "bye", isWinner: false };
  }

  if (source.kind === "participant") {
    return {
      participant: lookupParticipant(participantById, source.participantId),
      state: "confirmed",
      isWinner: false,
    };
  }

  if (!matchIds.has(source.matchId)) {
    throw new Error(`Slot references unknown matchId "${source.matchId}"`);
  }
  const winnerId = winnerByMatchId.get(source.matchId);
  if (winnerId === undefined) {
    return { participant: null, state: "pending", isWinner: false };
  }
  return {
    participant: lookupParticipant(participantById, winnerId),
    state: "confirmed",
    isWinner: false,
  };
}

function lookupParticipant(
  participantById: Map<string, Participant>,
  participantId: string,
): Participant {
  const participant = participantById.get(participantId);
  if (!participant) {
    throw new Error(`Unknown participantId "${participantId}"`);
  }
  return participant;
}

function sourceMatchId(source: SlotSource): string | null {
  return source.kind === "winnerOf" ? source.matchId : null;
}

function toStatus(
  hasBye: boolean,
  winnerId: string | null,
  slots: [ResolvedSlot, ResolvedSlot],
): MatchStatus {
  if (hasBye) return "bye";
  if (winnerId !== null) return "done";
  if (slots.every((slot) => slot.state === "confirmed")) return "ready";
  return "waiting";
}
