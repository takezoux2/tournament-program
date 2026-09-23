"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { SlotSourceOption } from "@/features/division/slot-source-options";
import {
  type DivisionFormAction,
  type DivisionFormState,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";

export type SlotEditTarget = {
  matchId: string;
  slotIndex: 0 | 1;
  /** 展開済みの試合名。無ければ null */
  matchName: string | null;
  /** 今そのスロットに居る人の名前。空きなら null */
  occupantName: string | null;
};

export type SlotEditActions = {
  assignSlot: DivisionFormAction;
  clearSlot: DivisionFormAction;
  removeMatch: DivisionFormAction;
};

/** 成功のたびに増える succeeded を前回値と比べ、増えたら閉じる（MatchResultRow と同じ方式）。 */
const useCloseOnSuccess = (state: DivisionFormState, close: () => void) => {
  const succeeded = state.succeeded ?? 0;
  const trackedRef = useRef(succeeded);
  useEffect(() => {
    if (succeeded > trackedRef.current) {
      trackedRef.current = succeeded;
      close();
    }
  }, [succeeded, close]);
};

/**
 * 1 回戦の 1 スロットを編集するモーダル。呼び出し側は target ごとに key を変えて
 * 描き直すこと(前のスロットの入力やエラーを持ち越さないため)。
 */
type SlotMode = "existing" | "new" | "matchResult" | "leagueRank";

export function SlotEditDialog({
  target,
  slug,
  tournamentId,
  divisionId,
  members,
  actions,
  onClose,
  sourceOptions,
}: {
  target: SlotEditTarget;
  slug: string;
  tournamentId: string;
  divisionId: string;
  members: MemberSummary[];
  actions: SlotEditActions;
  onClose: () => void;
  /** 参照できる他部門。自部門は呼び出し側で除いておく */
  sourceOptions: SlotSourceOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // 試合を持たない部門は勝者・敗者の参照先にならない。順位はリーグだけ。
  const matchOptions = sourceOptions.filter(
    (option) => option.matches.length > 0,
  );
  const leagueOptions = sourceOptions.filter((option) => option.maxRank > 0);

  const [mode, setMode] = useState<SlotMode>(
    members.length === 0 ? "new" : "existing",
  );
  const [matchDivisionId, setMatchDivisionId] = useState(
    matchOptions[0]?.divisionId ?? "",
  );
  const [leagueDivisionId, setLeagueDivisionId] = useState(
    leagueOptions[0]?.divisionId ?? "",
  );
  const selectedMatches =
    matchOptions.find((option) => option.divisionId === matchDivisionId)
      ?.matches ?? [];
  const selectedLeague = leagueOptions.find(
    (option) => option.divisionId === leagueDivisionId,
  );
  // 選べる枝が 1 つしか無ければラジオは出さない（新規登録は常に選べるので最低 1）。
  const modeCount =
    (members.length > 0 ? 1 : 0) +
    1 +
    (matchOptions.length > 0 ? 1 : 0) +
    (leagueOptions.length > 0 ? 1 : 0);
  const [assignState, assignAction, assignPending] = useActionState(
    actions.assignSlot,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [clearState, clearAction, clearPending] = useActionState(
    actions.clearSlot,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [removeState, removeAction, removePending] = useActionState(
    actions.removeMatch,
    INITIAL_DIVISION_FORM_STATE,
  );

  // 3 つのフォームはそれぞれ自分の state を持つ。先に失敗した操作のエラーが
  // 後の操作の失敗を隠さないよう、最後に送ったフォームのエラーだけを出す。
  const [lastSubmitted, setLastSubmitted] = useState<
    "assign" | "clear" | "remove" | null
  >(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = useRef(() => dialogRef.current?.close()).current;
  useCloseOnSuccess(assignState, close);
  useCloseOnSuccess(clearState, close);
  useCloseOnSuccess(removeState, close);

  const pending = assignPending || clearPending || removePending;
  const error =
    lastSubmitted === "assign"
      ? assignState.error
      : lastSubmitted === "clear"
        ? clearState.error
        : lastSubmitted === "remove"
          ? removeState.error
          : null;

  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <input type="hidden" name="matchId" value={target.matchId} />
      <input type="hidden" name="slotIndex" value={String(target.slotIndex)} />
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-sm rounded border border-slate-200 bg-white p-0 backdrop:bg-slate-900/40"
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 id={titleId} className="text-base font-bold text-slate-800">
            {target.matchName ?? "試合"} の
            {target.slotIndex === 0 ? "上" : "下"}側
          </h2>
          <p className="text-sm text-slate-600">
            現在: {target.occupantName ?? "空き"}
          </p>
        </div>

        <form
          action={assignAction}
          onSubmit={() => setLastSubmitted("assign")}
          className="space-y-3"
        >
          {hidden}
          <input type="hidden" name="mode" value={mode} />
          {modeCount > 1 && (
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              {members.length > 0 && (
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modeChoice"
                    checked={mode === "existing"}
                    onChange={() => setMode("existing")}
                  />
                  既存のメンバーから選ぶ
                </label>
              )}
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="modeChoice"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                />
                新しく登録する
              </label>
              {matchOptions.length > 0 && (
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modeChoice"
                    checked={mode === "matchResult"}
                    onChange={() => setMode("matchResult")}
                  />
                  他部門の試合の結果
                </label>
              )}
              {leagueOptions.length > 0 && (
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modeChoice"
                    checked={mode === "leagueRank"}
                    onChange={() => setMode("leagueRank")}
                  />
                  他部門のリーグ順位
                </label>
              )}
            </div>
          )}
          {mode === "existing" && (
            <div className="space-y-1">
              <label
                htmlFor={`${titleId}-member`}
                className="block text-sm font-medium text-slate-700"
              >
                メンバー
              </label>
              <select
                id={`${titleId}-member`}
                name="memberId"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode === "new" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-name`}
                  className="block text-sm font-medium text-slate-700"
                >
                  氏名
                </label>
                <input
                  id={`${titleId}-name`}
                  name="name"
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-kana`}
                  className="block text-sm font-medium text-slate-700"
                >
                  氏名（かな）
                </label>
                <input
                  id={`${titleId}-kana`}
                  name="nameKana"
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          {mode === "matchResult" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-match-division`}
                  className="block text-sm font-medium text-slate-700"
                >
                  参照する部門
                </label>
                <select
                  id={`${titleId}-match-division`}
                  name="sourceDivisionId"
                  value={matchDivisionId}
                  onChange={(event) => setMatchDivisionId(event.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {matchOptions.map((option) => (
                    <option key={option.divisionId} value={option.divisionId}>
                      {option.divisionName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-match`}
                  className="block text-sm font-medium text-slate-700"
                >
                  参照する試合
                </label>
                <select
                  id={`${titleId}-match`}
                  name="sourceMatchId"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {selectedMatches.map((match) => (
                    <option key={match.matchId} value={match.matchId}>
                      {match.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="outcome"
                    value="winner"
                    defaultChecked
                  />
                  勝者
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="outcome" value="loser" />
                  敗者
                </label>
              </div>
            </div>
          )}
          {mode === "leagueRank" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-league`}
                  className="block text-sm font-medium text-slate-700"
                >
                  参照するリーグ
                </label>
                <select
                  id={`${titleId}-league`}
                  name="sourceDivisionId"
                  value={leagueDivisionId}
                  onChange={(event) => setLeagueDivisionId(event.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {leagueOptions.map((option) => (
                    <option key={option.divisionId} value={option.divisionId}>
                      {option.divisionName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-rank`}
                  className="block text-sm font-medium text-slate-700"
                >
                  順位
                </label>
                <input
                  id={`${titleId}-rank`}
                  name="rank"
                  type="number"
                  min={1}
                  max={selectedLeague?.maxRank ?? 1}
                  defaultValue={1}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {/* 決まる条件を先に知らせる。同順位のときは空欄のままになる */}
              <p className="text-xs text-slate-500">
                リーグの全試合が終わると選手が決まります
              </p>
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            この選手にする
          </button>
        </form>

        {error !== null && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4">
          <div className="flex gap-2">
            {target.occupantName !== null && (
              <form
                action={clearAction}
                onSubmit={() => setLastSubmitted("clear")}
              >
                {hidden}
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                >
                  スロットを空にする
                </button>
              </form>
            )}
            <form
              action={removeAction}
              onSubmit={() => setLastSubmitted("remove")}
            >
              {hidden}
              <button
                type="submit"
                disabled={pending}
                className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
              >
                試合を削除
              </button>
            </form>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            キャンセル
          </button>
        </div>
      </div>
    </dialog>
  );
}
