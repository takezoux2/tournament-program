"use client";

import { useActionState } from "react";
import {
  INITIAL_ORGANIZATION_FORM_STATE,
  type OrganizationFormAction,
} from "@/features/organization/state";

export function OrganizationForm({
  action,
  submitLabel,
  defaultName = "",
  fixedSlug,
}: {
  action: OrganizationFormAction;
  submitLabel: string;
  defaultName?: string;
  /** 編集時に渡す。渡された場合、組織 ID は変更できず hidden で送るだけになる。 */
  fixedSlug?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          組織名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {fixedSlug === undefined ? (
        <div className="space-y-1">
          <label
            htmlFor="slug"
            className="block text-sm font-medium text-slate-700"
          >
            組織 ID
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            URL に使う。半角英小文字・数字・ハイフンのみ。あとから変更できない
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="block text-sm font-medium text-slate-700">組織 ID</p>
          <p className="text-sm text-slate-600">{fixedSlug}</p>
          <input type="hidden" name="slug" value={fixedSlug} />
        </div>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : submitLabel}
      </button>
    </form>
  );
}
