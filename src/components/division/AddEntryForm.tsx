"use client";

import { useActionState, useState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";

type Mode = "existing" | "new";

export function AddEntryForm({
  action,
  slug,
  tournamentId,
  divisionId,
  members,
  disabled,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  divisionId: string;
  members: MemberSummary[];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  // メンバーが 1 人も居ないうちは選びようがないので、新規登録だけを見せる。
  const [mode, setMode] = useState<Mode>(
    members.length === 0 ? "new" : "existing",
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-bold text-slate-700">エントリーを追加</h3>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
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
          <label
            htmlFor="memberId"
            className="block text-sm font-medium text-slate-700"
          >
            メンバー
          </label>
          <select
            id="memberId"
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
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700"
            >
              氏名
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="nameKana"
              className="block text-sm font-medium text-slate-700"
            >
              氏名（かな）
            </label>
            <input
              id="nameKana"
              name="nameKana"
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== undefined && (
        // biome の useSemanticElements 指摘に従い、role="status" ではなく
        // 暗黙のロールが status な <output> を使う。
        <output className="text-sm text-slate-600">{state.notice}</output>
      )}

      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "追加中..." : "エントリーを追加"}
      </button>
    </form>
  );
}
