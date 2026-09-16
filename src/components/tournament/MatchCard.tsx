import { MatchNoteButton } from "@/components/result/MatchNoteButton";
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
  winReason,
  reserveTopRight = false,
}: {
  matchId: string;
  slot: ResolvedSlot;
  index: 0 | 1;
  winReason?: string | null;
  /** 右上に重ねるメモボタンのぶん、右端を空けるか */
  reserveTopRight?: boolean;
}) {
  return (
    <div
      data-testid={`slot-${matchId}-${index}`}
      data-slot-state={slot.state}
      data-winner={slot.isWinner ? "true" : "false"}
      className={`flex h-1/2 items-center gap-2 px-2 text-sm ${
        index === 0 ? "border-b border-slate-200" : ""
      } ${reserveTopRight ? "pr-8" : ""} ${slotTone(slot)}`}
    >
      <span className="w-5 shrink-0 text-right text-xs text-slate-400">
        {slot.participant ? slot.participant.seed : ""}
      </span>
      <span className="min-w-0 flex-1 truncate">{slotLabel(slot)}</span>
      {slot.score !== null && (
        <span className="shrink-0 pl-1 text-[10px] text-slate-500">
          {slot.score}
        </span>
      )}
      {winReason !== null && winReason !== undefined && slot.isWinner && (
        <span
          title={winReason}
          className="min-w-0 max-w-20 truncate rounded bg-slate-100 px-1 text-[10px] text-slate-500"
        >
          {winReason}
        </span>
      )}
    </div>
  );
}

export function MatchCard({ match }: { match: ResolvedMatch }) {
  // スロットに 1 つでもスコアがあれば旧来の右上バッジと重なるため、
  // そちらは出さない。
  const hasSlotScore = match.slots.some((slot) => slot.score !== null);
  const hasNote = match.note !== null && match.note !== "";

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
        winReason={match.winReason}
        reserveTopRight={hasNote}
      />
      <SlotRow
        matchId={match.id}
        slot={match.slots[1]}
        index={1}
        winReason={match.winReason}
      />
      {match.score && !hasSlotScore ? (
        <span
          className={`absolute top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500 ${
            hasNote ? "right-8" : "right-1"
          }`}
        >
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
      {/*
        左上は試合番号・シード・1 人目の名前で埋まっているので右上に置く。
        1 行目は reserveTopRight で右端を空け、旧来のスコアバッジはその左へずらす。
        ブラケットはノードの選択もドラッグも切っているため、React Flow がノードに
        pointer-events: none を付け、押下が下のパンに抜けてボタンを押せない。
        pointer-events-auto でこのボタンだけ受け取れるようにし、nodrag / nopan で
        その押下をドラッグ・パンとして扱わせない。
      */}
      <span className="nodrag nopan pointer-events-auto absolute right-1 top-0 leading-4">
        <MatchNoteButton
          note={match.note}
          label={
            match.matchNumber !== null
              ? `第${match.matchNumber}試合のメモ`
              : "試合のメモ"
          }
        />
      </span>
    </div>
  );
}
