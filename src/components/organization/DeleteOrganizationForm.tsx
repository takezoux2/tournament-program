"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_ORGANIZATION_FORM_STATE,
  type OrganizationFormAction,
} from "@/features/organization/state";

export function DeleteOrganizationForm({
  action,
  organizationName,
  slug,
}: {
  action: OrganizationFormAction;
  organizationName: string;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_FORM_STATE,
  );
  const [confirmName, setConfirmName] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-red-200 bg-red-50 p-4"
    >
      <h2 className="text-sm font-bold text-red-800">組織を削除</h2>
      <p className="text-xs text-red-700">
        この組織に属する大会とメンバーもすべて削除されます。元に戻せません。
      </p>

      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-1">
        <label
          htmlFor="confirmName"
          className="block text-sm font-medium text-red-800"
        >
          確認のため組織名を入力
        </label>
        <input
          id="confirmName"
          name="confirmName"
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          className="w-full rounded border border-red-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        // ボタンの活性はあくまで体感のためで、境界ではない。
        // 一致の判定は handler が DB の値と突き合わせて行う。
        disabled={pending || confirmName !== organizationName}
        className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "削除中..." : "この組織を削除する"}
      </button>
    </form>
  );
}
