"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { useActionState, useTransition } from "react";
import {
  INITIAL_SCHEDULE_FORM_STATE,
  type ScheduleFormAction,
} from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";
import { ScheduleDividerRow } from "./ScheduleDividerRow";
import { ScheduleMatchRow } from "./ScheduleMatchRow";
import { resolveDragReorder } from "./schedule-drag";

/**
 * 1 行ぶんの並べ替え可能な枠。掴む場所をハンドルのボタンに限るのは、
 * 行の中に見出しの入力欄や保存ボタンがあり、行全体を掴めるようにすると
 * 文字を選択できなくなるため。
 *
 * transform を translate3d に自前で直しているのは、@dnd-kit/utilities を
 * 依存に足さないため。縦一列の並べ替えなので y だけ見れば足りる。
 */
function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const sortable = useSortable({ id });

  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform
          ? `translate3d(0, ${sortable.transform.y}px, 0)`
          : undefined,
        transition: sortable.transition,
      }}
      className={
        sortable.isDragging
          ? "flex items-start gap-3 rounded border border-slate-800 bg-slate-50 px-3 py-2"
          : "flex items-start gap-3 rounded border border-slate-200 bg-white px-3 py-2"
      }
    >
      <button
        type="button"
        aria-label="ドラッグして並べ替え"
        className="cursor-grab rounded px-1 text-slate-400"
        {...sortable.listeners}
        {...sortable.attributes}
      >
        ⠿
      </button>
      {children}
    </li>
  );
}

export function ScheduleList({
  slug,
  tournamentId,
  rows,
  reorderAction,
  insertDividerAction,
  updateDividerAction,
  removeDividerAction,
}: {
  slug: string;
  tournamentId: string;
  /** 進行順に並べて渡す。この並びがそのまま画面の並びになる。 */
  rows: ScheduleRowView[];
  reorderAction: ScheduleFormAction;
  insertDividerAction: ScheduleFormAction;
  updateDividerAction: ScheduleFormAction;
  removeDividerAction: ScheduleFormAction;
}) {
  const [reorderState, reorder] = useActionState(
    reorderAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );
  const [insertState, insert] = useActionState(
    insertDividerAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const keys = rows.map((row) => row.key);

  const handleDragEnd = (event: DragEndEvent): void => {
    const next = resolveDragReorder(
      keys,
      String(event.active.id),
      event.over === null ? null : String(event.over.id),
    );
    if (next === null) {
      return;
    }

    // フォーム要素を経由せずに送るため、FormData をここで組み立てる。
    // 行ごとの hidden input にすると、ドラッグ中の並びと送信内容がずれる。
    const data = new FormData();
    data.set("slug", slug);
    data.set("tournamentId", tournamentId);
    for (const key of next) {
      data.append("key", key);
    }
    startTransition(() => reorder(data));
  };

  const insertAfter = (anchorKey: string): void => {
    const data = new FormData();
    data.set("slug", slug);
    data.set("tournamentId", tournamentId);
    data.set("anchorKey", anchorKey);
    startTransition(() => insert(data));
  };

  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        左端をドラッグすると進行順を入れ替えられます
      </p>

      {reorderState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {reorderState.error}
        </p>
      )}
      {insertState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {insertState.error}
        </p>
      )}

      <button
        type="button"
        onClick={() => insertAfter("")}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
      >
        先頭に区切りを挿入
      </button>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {rows.map((row) => (
              <SortableRow key={row.key} id={row.key}>
                {row.kind === "match" ? (
                  <ScheduleMatchRow row={row} />
                ) : (
                  <ScheduleDividerRow
                    row={row}
                    slug={slug}
                    tournamentId={tournamentId}
                    updateAction={updateDividerAction}
                    removeAction={removeDividerAction}
                  />
                )}
                <button
                  type="button"
                  onClick={() => insertAfter(row.key)}
                  className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                >
                  この下に区切りを挿入
                </button>
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
