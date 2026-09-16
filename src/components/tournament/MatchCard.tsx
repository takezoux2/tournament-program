import { NODE_HEIGHT, NODE_WIDTH } from "@/features/bracket/layout-bracket";
import type { ResolvedMatch, ResolvedSlot } from "@/features/bracket/types";

function slotLabel(slot: ResolvedSlot): string {
  if (slot.state === "bye") return "BYE";
  return slot.participant?.name ?? "未定";
}

/** 勝者が決まった試合で、勝てなかった確定参加者のスロットか。 */
function isLoser(slot: ResolvedSlot, decided: boolean): boolean {
  return decided && !slot.isWinner && slot.state === "confirmed";
}

function slotTone(slot: ResolvedSlot, decided: boolean): string {
  if (slot.isWinner) return "bg-green-200 font-bold text-green-900";
  if (isLoser(slot, decided)) return "bg-slate-100 text-slate-400";
  if (slot.state === "confirmed") return "text-slate-700";
  return "text-slate-400";
}

function SlotRow({
  matchId,
  slot,
  index,
  decided,
}: {
  matchId: string;
  slot: ResolvedSlot;
  index: 0 | 1;
  decided: boolean;
}) {
  return (
    <div
      data-testid={`slot-${matchId}-${index}`}
      data-slot-state={slot.state}
      data-winner={slot.isWinner ? "true" : "false"}
      data-loser={isLoser(slot, decided) ? "true" : "false"}
      className={`flex h-1/2 items-center gap-2 px-2 text-sm ${
        index === 0 ? "border-b border-slate-200" : ""
      } ${slotTone(slot, decided)}`}
    >
      <span className="w-5 shrink-0 text-right text-xs text-slate-400">
        {slot.participant ? slot.participant.seed : ""}
      </span>
      <span className="flex-1 truncate">{slotLabel(slot)}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: ResolvedMatch }) {
  const decided = match.winnerId !== null;
  return (
    <div
      data-testid={`match-${match.id}`}
      data-status={match.status}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className="relative overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm"
    >
      <SlotRow
        matchId={match.id}
        slot={match.slots[0]}
        index={0}
        decided={decided}
      />
      <SlotRow
        matchId={match.id}
        slot={match.slots[1]}
        index={1}
        decided={decided}
      />
      {match.score ? (
        <span className="absolute right-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500">
          {match.score}
        </span>
      ) : null}
      {match.matchName !== null ? (
        <span
          data-testid={`match-name-${match.id}`}
          className="absolute left-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500"
        >
          {match.matchName}
        </span>
      ) : null}
    </div>
  );
}
