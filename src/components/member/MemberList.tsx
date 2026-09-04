"use client";

import { useActionState } from "react";
import type { MemberSummary } from "@/features/member/repository";
import {
  INITIAL_MEMBER_FORM_STATE,
  type MemberFormAction,
} from "@/features/member/state";

/**
 * 行ごとの削除フォーム。useActionState は 1 行に 1 つ要るため、
 * 行のコンポーネントとして切り出している。
 */
function RemoveMemberButton({
  slug,
  member,
  action,
}: {
  slug: string;
  member: MemberSummary;
  action: MemberFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_MEMBER_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="memberId" value={member.id} />
      <button
        type="submit"
        disabled={pending}
        // 確認は onSubmit ではなく onClick で挟む。キャンセル時に
        // フォームの送信自体を起こさないため。
        onClick={(event) => {
          if (!window.confirm(`${member.name} をこの組織から削除しますか？`)) {
            event.preventDefault();
          }
        }}
        className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
      >
        {pending ? "削除中..." : `${member.name} を削除`}
      </button>
      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function MemberList({
  slug,
  members,
  canRemove,
  removeAction,
}: {
  slug: string;
  members: MemberSummary[];
  canRemove: boolean;
  removeAction: MemberFormAction;
}) {
  if (members.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        この組織に登録されているメンバーはいません
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {members.map((member) => (
        <li key={member.id} className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {member.name}
            </p>
            <p className="truncate text-xs text-slate-500">{member.nameKana}</p>
          </div>

          {/* ボタンを隠すのは体感のためで、拒否の境界は Server Action 側にある。 */}
          {canRemove && (
            <RemoveMemberButton
              slug={slug}
              member={member}
              action={removeAction}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
