import { NODE_HEIGHT, NODE_WIDTH } from "@/features/bracket/layout-bracket";
import type { ResolvedMatch, ResolvedSlot } from "@/features/bracket/types";

function slotLabel(slot: ResolvedSlot): string {
  if (slot.state === "bye") return "BYE";
  return slot.participant?.name ?? "未定";
}

function slotTone(slot: ResolvedSlot): string {
  if (slot.isWinner) return "bg-amber-50 font-bold text-slate-900";
  if (slot.state === "confirmed") return "text-slate-700";
  return "text-slate-400";
}

function SlotRow({
  matchId,
  slot,
  index,
}: {
  matchId: string;
  slot: ResolvedSlot;
  index: 0 | 1;
}) {
  return (
    <div
      data-testid={`slot-${matchId}-${index}`}
      data-slot-state={slot.state}
      data-winner={slot.isWinner ? "true" : "false"}
      className={`flex h-1/2 items-center gap-2 px-2 text-sm ${
        index === 0 ? "border-b border-slate-200" : ""
      } ${slotTone(slot)}`}
    >
      <span className="w-5 shrink-0 text-right text-xs text-slate-400">
        {slot.participant ? slot.participant.seed : ""}
      </span>
      <span className="flex-1 truncate">{slotLabel(slot)}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: ResolvedMatch }) {
  return (
    <div
      data-testid={`match-${match.id}`}
      data-status={match.status}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className="relative overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm"
    >
      <SlotRow matchId={match.id} slot={match.slots[0]} index={0} />
      <SlotRow matchId={match.id} slot={match.slots[1]} index={1} />
      {match.score ? (
        <span className="absolute right-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500">
          {match.score}
        </span>
      ) : null}
      {match.matchNumber !== null ? (
        <span
          data-testid={`match-number-${match.id}`}
          className="absolute left-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500"
        >
          {match.matchNumber}
        </span>
      ) : null}
    </div>
  );
}
