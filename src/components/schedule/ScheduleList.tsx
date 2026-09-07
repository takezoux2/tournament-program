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
import { HEAD_ANCHOR_KEY } from "@/features/schedule/domain";
import {
  INITIAL_SCHEDULE_FORM_STATE,
  type ScheduleFormAction,
} from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";
import { resolveDragReorder } from "@/lib/dnd/reorder";
import { ScheduleDividerRow } from "./ScheduleDividerRow";
import { ScheduleMatchRow } from "./ScheduleMatchRow";

/**
 * 1 行ぶんの並べ替え可能な枠。掴む場所をハンドルのボタンに限るのは、
 * 行の中に見出しの入力欄や保存ボタンがあり、行全体を掴めるようにすると
 * 文字を選択できなくなるため。
 *
 * transform を translate3d に自前で直しているのは、@dnd-kit/utilities を
 * 依存に足さないため。縦一列の並べ替えなので y だけ見れば足りる。
 *
 * name は行ごとの操作の名前を一意にするために受け取る。区切りは複数あるので、
 * 固定文言のままだと支援技術には同じ名前のハンドルが並んで見える。
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
          ? "flex items-start gap-3 rounded border border-slate-800 bg-slate-50 px-3 py-2"
          : "flex items-start gap-3 rounded border border-slate-200 bg-white px-3 py-2"
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
 * 行ごとの操作（ハンドル・挿入ボタン・区切りの入力欄）の名前に差し込む、その行の呼び名。
 * 一覧には同じ種類の行が並ぶので、名前にその行の中身を混ぜて区別できるようにする
 * （components/division/MatchOrderList.tsx と同じ形）。
 *
 * 見出しだけでなく position（1 始まりの並び順）も混ぜるのは、区切りは既定の見出しの
 * まま複数置けるため、見出しだけだと名前が重なって区別できなくなるから。
 */
const rowName = (row: ScheduleRowView, position: number): string =>
  row.kind === "match"
    ? `${position}行目 ${row.divisionName} ${row.label}`
    : `${position}行目 区切り「${row.label}」`;

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
  const [reorderState, reorder, reordering] = useActionState(
    reorderAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );
  const [insertState, insert, inserting] = useActionState(
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

  /**
   * 送信中は挿入ボタンをすべて止める（inserting）。useActionState は dispatch を
   * 積むので、連打するとその回数だけ区切りが増える。
   */
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
      <p aria-live="polite" className="text-xs text-slate-500">
        {reordering
          ? "並べ替えを保存中..."
          : "左端をドラッグすると進行順を入れ替えられます"}
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

      {/* 「先頭に挿す」を表すアンカー。コメントではなく定数を送って型で対応を保つ。 */}
      <button
        type="button"
        onClick={() => insertAfter(HEAD_ANCHOR_KEY)}
        disabled={inserting}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
      >
        先頭に区切りを挿入
      </button>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {rows.map((row, index) => {
              const name = rowName(row, index + 1);

              return (
                <SortableRow
                  key={row.key}
                  id={row.key}
                  name={name}
                  disabled={reordering}
                >
                  {row.kind === "match" ? (
                    <ScheduleMatchRow row={row} />
                  ) : (
                    <ScheduleDividerRow
                      row={row}
                      name={name}
                      slug={slug}
                      tournamentId={tournamentId}
                      updateAction={updateDividerAction}
                      removeAction={removeDividerAction}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => insertAfter(row.key)}
                    disabled={inserting}
                    aria-label={`${name}の下に区切りを挿入`}
                    className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
                  >
                    この下に区切りを挿入
                  </button>
                </SortableRow>
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
