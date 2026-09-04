"use client";

import { useActionState } from "react";
import {
  INITIAL_MEMBER_FORM_STATE,
  type MemberFormAction,
} from "@/features/member/state";

export function AddMemberForm({
  slug,
  addAction,
}: {
  slug: string;
  addAction: MemberFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    addAction,
    INITIAL_MEMBER_FORM_STATE,
  );

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-700">メンバーを追加</h2>

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="slug" value={slug} />

        <label
          htmlFor="member-name"
          className="block text-sm font-medium text-slate-700"
        >
          氏名
        </label>
        <input
          id="member-name"
          name="name"
          type="text"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />

        <label
          htmlFor="member-name-kana"
          className="block text-sm font-medium text-slate-700"
        >
          氏名（かな）
        </label>
        <input
          id="member-name-kana"
          name="nameKana"
          type="text"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "追加中..." : "追加"}
        </button>

        {state.error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}
