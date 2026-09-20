"use client";

import { useActionState, useId, useState } from "react";
import type { MemberSummary } from "@/features/member/repository";
import {
  INITIAL_PARTICIPANT_FORM_STATE,
  type ParticipantFormAction,
} from "@/features/participant/state";

type Mode = "existing" | "new";

/**
 * 大会に参加者を足すフォーム。部門を経由しないので divisionId は無い。
 * components/division/AddEntryForm.tsx と同じ二択だが、送り先も状態の型も
 * 違うため別物として持つ。
 */
export function AddParticipantForm({
  slug,
  tournamentId,
  members,
  action,
}: {
  slug: string;
  tournamentId: string;
  members: MemberSummary[];
  action: ParticipantFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PARTICIPANT_FORM_STATE,
  );
  // メンバーが 1 人も居ないうちは選びようがないので、新規登録だけを見せる。
  const [mode, setMode] = useState<Mode>(
    members.length === 0 ? "new" : "existing",
  );
  const memberId = useId();
  const nameId = useId();
  const nameKanaId = useId();

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-bold text-slate-700">参加者を追加</h2>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="mode" value={mode} />

      {members.length > 0 && (
        <div className="flex gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="modeChoice"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            既存のメンバーから選ぶ
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="modeChoice"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            新しく登録する
          </label>
        </div>
      )}

      {mode === "existing" ? (
        <div className="space-y-1">
          <label className="text-xs text-slate-500" htmlFor={memberId}>
            メンバー
          </label>
          <select
            id={memberId}
            name="memberId"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}（{member.nameKana}）
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500" htmlFor={nameId}>
              氏名
            </label>
            <input
              id={nameId}
              type="text"
              name="name"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500" htmlFor={nameKanaId}>
              氏名（かな）
            </label>
            <input
              id={nameKanaId}
              type="text"
              name="nameKana"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "追加中..." : "追加"}
      </button>

      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
