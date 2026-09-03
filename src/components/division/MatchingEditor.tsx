"use client";

import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type {
  SetupMatchView,
  SetupSlotView,
} from "@/features/division/single-elimination/view";
import { resolveDragSwap, slotDomId } from "./matching-drag";

/**
 * bye と「参加者を引けなかった entry」は別物として書き分ける。
 * 引けないだけのスロットを「不戦勝」と出すとブラケットの読み違いになる。
 * 引けない場合の文言は EntryList の行と揃える。
 */
const slotLabel = (slot: SetupSlotView): string =>
  slot.kind === "bye" ? "（不戦勝）" : (slot.label ?? "（不明な参加者）");

function Slot({ slot, disabled }: { slot: SetupSlotView; disabled: boolean }) {
  const id = slotDomId(slot.index);
  // 同じスロットが掴む側にも落とされる側にもなる。交換なので両方要る。
  const draggable = useDraggable({ id, disabled });
  const droppable = useDroppable({ id, disabled });

  return (
    <div
      ref={droppable.setNodeRef}
      className={
        droppable.isOver
          ? "rounded border border-slate-800 bg-slate-100 px-3 py-2"
          : "rounded border border-slate-200 px-3 py-2"
      }
    >
      <button
        type="button"
        ref={draggable.setNodeRef}
        disabled={disabled}
        className="w-full text-left text-sm text-slate-800 disabled:opacity-50"
        {...draggable.listeners}
        {...draggable.attributes}
      >
        {slotLabel(slot)}
      </button>
    </div>
  );
}

export function MatchingEditor({
  matches,
  onSwap,
  disabled,
}: {
  matches: SetupMatchView[];
  onSwap: (indexA: number, indexB: number) => void;
  disabled: boolean;
}) {
  if (matches.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
        組み合わせが未作成です
      </p>
    );
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const swap = resolveDragSwap(
      String(event.active.id),
      event.over === null ? null : String(event.over.id),
    );
    if (swap !== null) {
      onSwap(swap[0], swap[1]);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        スロットをドラッグして別のスロットへ落とすと入れ替わります
      </p>

      <DndContext onDragEnd={handleDragEnd}>
        <ul className="space-y-2">
          {matches.map((match) => (
            <li
              key={match.matchId}
              className="space-y-1 rounded border border-slate-200 bg-white p-3"
            >
              <Slot slot={match.slots[0]} disabled={disabled} />
              <Slot slot={match.slots[1]} disabled={disabled} />
            </li>
          ))}
        </ul>
      </DndContext>
    </div>
  );
}
