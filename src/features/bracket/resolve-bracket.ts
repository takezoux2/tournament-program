import type {
  Bracket,
  MatchResult,
  MatchStatus,
  Participant,
  ResolvedMatch,
  ResolvedSlot,
  SlotSource,
} from "./types";

type Settled = { slots: [ResolvedSlot, ResolvedSlot]; winnerId: string | null };

/**
 * 参加者・ブラケット構造・勝敗の 3 データを突き合わせ、描画可能な形へ畳み込む。
 * ラウンド昇順に走査することで、前ラウンドの勝者・敗者を 1 パスで次ラウンドへ伝播できる。
 */
export function resolveBracket(
  participants: Participant[],
  bracket: Bracket,
  results: MatchResult[],
): ResolvedMatch[] {
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const resultByMatchId = new Map(results.map((r) => [r.matchId, r]));
  const matchIds = new Set(bracket.matches.map((m) => m.id));
  const nameByMatchId = new Map(
    bracket.matches.map((m) => [m.id, m.matchName]),
  );
  const settled = new Map<string, Settled>();

  const ordered = [...bracket.matches].sort(
    (a, b) => a.round - b.round || a.order - b.order,
  );

  return ordered.map((match) => {
    const context: SlotContext = {
      participantById,
      matchIds,
      nameByMatchId,
      settled,
    };
    const slots: [ResolvedSlot, ResolvedSlot] = [
      resolveSlot(match.slots[0], context),
      resolveSlot(match.slots[1], context),
    ];
    const sourceMatchIds: [string | null, string | null] = [
      sourceMatchId(match.slots[0]),
      sourceMatchId(match.slots[1]),
    ];

    // 元データの bye だけでなく、前の試合から伝播した bye も不戦勝として扱う。
    const hasBye = slots.some((slot) => slot.state === "bye");
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
      for (const slot of slots) {
        slot.isWinner = slot.participant?.id === winnerId;
      }
    }

    const scoreByParticipant = new Map(
      (result?.scores ?? []).map((entry) => [entry.participantId, entry.score]),
    );
    for (const slot of slots) {
      slot.score =
        slot.participant === null
          ? null
          : (scoreByParticipant.get(slot.participant.id) ?? null);
    }

    settled.set(match.id, { slots, winnerId });

    return {
      id: match.id,
      bracket: match.bracket ?? "winners",
      round: match.round,
      order: match.order,
      matchName: match.matchName ?? null,
      slots,
      winnerId,
      score,
      winReason: result?.winReason ?? null,
      note: result?.note ?? null,
      status: toStatus(hasBye, winnerId, slots),
      sourceMatchIds,
    };
  });
}

type SlotContext = {
  participantById: Map<string, Participant>;
  matchIds: Set<string>;
  nameByMatchId: Map<string, string | undefined>;
  settled: Map<string, Settled>;
};

function resolveSlot(source: SlotSource, context: SlotContext): ResolvedSlot {
  if (source.kind === "bye") {
    return { participant: null, state: "bye", isWinner: false, score: null };
  }

  if (source.kind === "participant") {
    return {
      participant: lookupParticipant(
        context.participantById,
        source.participantId,
      ),
      state: "confirmed",
      isWinner: false,
      score: null,
    };
  }

  if (!context.matchIds.has(source.matchId)) {
    throw new Error(`Slot references unknown matchId "${source.matchId}"`);
  }
  const origin = context.settled.get(source.matchId);
  const pending: ResolvedSlot = {
    participant: null,
    state: "pending",
    isWinner: false,
    score: null,
  };
  if (origin === undefined) {
    return pending;
  }

  if (source.kind === "winnerOf") {
    // BYE どうしの試合からは誰も来ない。pending だと先が永久に進まない。
    if (origin.slots.every((slot) => slot.state === "bye")) {
      return { participant: null, state: "bye", isWinner: false, score: null };
    }
    if (origin.winnerId === null) {
      return pending;
    }
    return {
      participant: lookupParticipant(context.participantById, origin.winnerId),
      state: "confirmed",
      isWinner: false,
      score: null,
    };
  }

  // loserOf: BYE を含む試合は不戦勝なので敗者が生まれない。
  if (origin.slots.some((slot) => slot.state === "bye")) {
    return { participant: null, state: "bye", isWinner: false, score: null };
  }
  const loser =
    origin.winnerId === null
      ? undefined
      : origin.slots.find(
          (slot) =>
            slot.state === "confirmed" &&
            slot.participant?.id !== origin.winnerId,
        );
  if (loser?.participant) {
    return {
      participant: loser.participant,
      state: "confirmed",
      isWinner: false,
      score: null,
    };
  }
  // 名前は展開済みの試合名（from-division が渡す）。スロットの文言
  // （createSlotLabeler の「◯◯の敗者」）と同じ形にそろえる。
  const name = context.nameByMatchId.get(source.matchId);
  return name === undefined
    ? pending
    : { ...pending, pendingLabel: `${name}の敗者` };
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
