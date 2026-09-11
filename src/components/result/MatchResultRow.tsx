"use client";

import type { MouseEvent } from "react";
import { useActionState, useEffect, useRef } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type {
  ResultRowView,
  ResultSlotView,
} from "@/features/schedule/result-rows";
import { trackEvent } from "@/shared/lib/analytics/events";

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

/**
 * 勝者を選ぶボタン。submit の value に entryId を載せ、押したボタンの
 * name/value がそのまま FormData に入る形にしている。ラジオ + 保存だと
 * タップが 2 回になるため。
 */
function WinnerButton({
  row,
  slot,
  disabled,
  onClick,
}: {
  row: MatchRow;
  slot: ResultSlotView;
  disabled: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isWinner =
    row.winnerEntryId !== null && slot.entryId === row.winnerEntryId;

  return (
    <button
      type="submit"
      name="winnerEntryId"
      value={slot.entryId ?? ""}
      aria-label={`${row.divisionName} 第${row.matchName}試合 ${slot.label}の勝ち`}
      aria-pressed={isWinner}
      disabled={disabled || slot.entryId === null}
      onClick={onClick}
      className={
        isWinner
          ? "rounded border border-slate-800 bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          : "rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
      }
    >
      {slot.label}
    </button>
  );
}

/**
 * 1 行 1 フォーム。useActionState を行ごとに持たせ、エラーをその行に出す。
 * 入力できるのは両者が確定している試合だけで、未確定（waiting）と
 * 不戦勝（bye）は押せない。勝者は自動で決まるか、まだ決まっていない。
 */
export function MatchResultRow({
  row,
  slug,
  tournamentId,
  action,
}: {
  row: MatchRow;
  slug: string;
  tournamentId: string;
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  const editable = row.state === "ready" || row.state === "recorded";

  // recordResultAction は成功時も { error: null } を返し、初期状態と
  // 同じ形になる。さらに同じ行で登録と訂正が繰り返されるため、真偽値では
  // 足りない。成功のたびに増える succeeded を前回値と比べて発火する。
  const succeeded = state.succeeded ?? 0;
  const trackedRef = useRef(0);
  useEffect(() => {
    if (succeeded > trackedRef.current) {
      trackedRef.current = succeeded;
      trackEvent("record_result");
    }
  }, [succeeded]);

  // 消えるものがあるときだけ確認する。普段の入力はタップ 1 回で終わらせたい。
  // entryId には押したボタンの勝者候補（取り消しボタンなら null）を渡す。
  const confirmIfNeeded =
    (entryId: string | null) => (event: MouseEvent<HTMLButtonElement>) => {
      // 既に勝者になっている側をもう一度押しても、サーバー側（record-result の
      // repository）は「勝者が変わらないなら何も書き込まない＝下流も消さない」
      // ため、実際には何も取り消されない。にもかかわらず確認を出すと文言と
      // 挙動が食い違うので、この場合は確認を飛ばしてそのまま送信する。
      if (entryId !== null && entryId === row.winnerEntryId) {
        return;
      }
      if (row.downstreamRecordedCount === 0) {
        return;
      }
      const accepted = window.confirm(
        `この試合の結果を変えると、あとの試合の結果 ${row.downstreamRecordedCount} 件も取り消されます。よろしいですか？`,
      );
      if (!accepted) {
        event.preventDefault();
      }
    };

  return (
    <li className="rounded border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-slate-800">
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
              第{row.matchName}試合
            </span>
            <span className="truncate text-xs text-slate-500">
              {row.divisionName} / {row.label}
            </span>
          </p>
        </div>

        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="divisionId" value={row.divisionId} />
          <input type="hidden" name="matchId" value={row.matchId} />

          <WinnerButton
            row={row}
            slot={row.slots[0]}
            disabled={pending || !editable}
            onClick={confirmIfNeeded(row.slots[0].entryId)}
          />
          <span className="text-xs text-slate-400">vs</span>
          <WinnerButton
            row={row}
            slot={row.slots[1]}
            disabled={pending || !editable}
            onClick={confirmIfNeeded(row.slots[1].entryId)}
          />

          {row.state === "recorded" && (
            <button
              type="submit"
              name="winnerEntryId"
              value=""
              aria-label={`${row.divisionName} 第${row.matchName}試合の結果を取り消す`}
              disabled={pending}
              onClick={confirmIfNeeded(null)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
            >
              取り消し
            </button>
          )}
        </form>
      </div>

      {row.state === "bye" && (
        <p className="mt-1 text-xs text-slate-500">
          不戦勝で自動的に勝ち上がります
        </p>
      )}
      {state.error !== null && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.error}
        </p>
      )}
    </li>
  );
}
