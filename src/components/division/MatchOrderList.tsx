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
import type { MatchNumberRowView } from "@/features/division/match-number-view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import { resolveDragReorder } from "@/lib/dnd/reorder";
import { MatchNumberRow } from "./MatchNumberRow";

/**
 * 1 行ぶんの並べ替え可能な枠。掴む場所をハンドルのボタンに限るのは、
 * 行の中に試合番号の入力欄と保存ボタンがあり、行全体を掴めるようにすると
 * 文字を選択できなくなるため（components/schedule/ScheduleList.tsx と同じ形）。
 *
 * transform を translate3d に自前で直しているのは、@dnd-kit/utilities を
 * 依存に足さないため。縦一列の並べ替えなので y だけ見れば足りる。
 */
function SortableRow({
  id,
  name,
  disabled,
  children,
}: {
  id: string;
  name: string;
  /** 並べ替えの保存中。掴めてしまうと古い並びから計算して先の保存を打ち消す。 */
  disabled: boolean;
  children: ReactNode;
}) {
  const sortable = useSortable({ id, disabled });

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
          ? "flex items-center gap-3 rounded border border-slate-800 bg-slate-50 px-4 py-3"
          : "flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3"
      }
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={`${name}をドラッグして並べ替え`}
        className="cursor-grab rounded px-1 text-slate-400 disabled:cursor-default disabled:opacity-30"
        {...sortable.listeners}
        {...sortable.attributes}
      >
        ⠿
      </button>
      {children}
    </li>
  );
}

/**
 * 部門の試合を実施順に並べた一覧。行はドラッグで入れ替えられ、
 * 同じ行が試合番号の編集フォームを兼ねる。
 *
 * トーナメントとリーグで同じ部品を使う。並べ替えが変えるのは実施順と
 * 試合番号だけで、ブラケット上の位置（round/order）は動かさないため、
 * 形式によって挙動を分ける必要が無い。
 */
export function MatchOrderList({
  rows,
  slug,
  tournamentId,
  divisionId,
  reorderAction,
  setMatchNumberAction,
  emptyMessage,
}: {
  /** 実施順に並べて渡す。この並びがそのまま画面の並びになる。 */
  rows: MatchNumberRowView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  reorderAction: DivisionFormAction;
  setMatchNumberAction: DivisionFormAction;
  /** 行が 1 つも無いときの文言。画面ごとに言い方が違う。 */
  emptyMessage: string;
}) {
  const [reorderState, reorder, reordering] = useActionState(
    reorderAction,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const keys = rows.map((row) => row.matchId);

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
    data.set("divisionId", divisionId);
    for (const matchId of next) {
      data.append("matchId", matchId);
    }
    startTransition(() => reorder(data));
  };

  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {/*
        操作の説明は aria-live の外に置く。中に入れると、保存が終わって
        文言が戻るたびに、状態ではなくこの説明文がまるごと読み上げられる。
      */}
      <p className="text-xs text-slate-500">
        左端をドラッグすると実施順を入れ替えられます。並べ替えると試合番号は先頭から振り直されます。対戦表を作り直したときと、トーナメントで
        1 回戦の組み合わせを入れ替えたときは、実施順と試合番号が既定に戻ります
      </p>

      {/*
        読み上げるのは保存の状態だけ。空でも要素を残すのは、live
        region は中身が変わる前から DOM に居ないと通知されないため。
      */}
      <p aria-live="polite" className="text-xs text-slate-500">
        {reordering ? "並べ替えを保存中..." : ""}
      </p>

      {reorderState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {reorderState.error}
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <SortableRow
                key={row.matchId}
                id={row.matchId}
                name={`${index + 1}行目 ${row.label}`}
                disabled={reordering}
              >
                <MatchNumberRow
                  row={row}
                  slug={slug}
                  tournamentId={tournamentId}
                  divisionId={divisionId}
                  action={setMatchNumberAction}
                />
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
