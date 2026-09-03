"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { OrganizationUserSummary } from "@/features/organization-user/repository";
import {
  INITIAL_ORGANIZATION_USER_FORM_STATE,
  type OrganizationUserFormAction,
} from "@/features/organization-user/state";
import { UserAvatar } from "./UserAvatar";

/**
 * 行ごとの削除フォーム。useActionState は 1 行に 1 つ要るため、
 * 行のコンポーネントとして切り出している。
 */
function RemoveUserButton({
  slug,
  user,
  action,
}: {
  slug: string;
  user: OrganizationUserSummary;
  action: OrganizationUserFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_USER_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={user.userId} />
      <button
        type="submit"
        disabled={pending}
        // 確認は onSubmit ではなく onClick で挟む。キャンセル時に
        // フォームの送信自体を起こさないため。
        onClick={(event) => {
          if (!window.confirm(`${user.name} をこの組織から削除しますか？`)) {
            event.preventDefault();
          }
        }}
        className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
      >
        {pending ? "削除中..." : `${user.name} を削除`}
      </button>
      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function OrganizationUserList({
  slug,
  users,
  currentUserId,
  canRemove,
  canGrant,
  removeAction,
}: {
  slug: string;
  users: OrganizationUserSummary[];
  currentUserId: string;
  canRemove: boolean;
  canGrant: boolean;
  removeAction: OrganizationUserFormAction;
}) {
  if (users.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        この組織に所属しているユーザーはいません
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {users.map((user) => (
        <li key={user.userId} className="flex items-center gap-3 p-4">
          <UserAvatar name={user.name} image={user.image} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.username}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>

          <p className="shrink-0 text-xs text-slate-500">
            権限 {user.permissionCodes.length} 件
          </p>

          {canGrant && (
            <Link
              href={`/orgs/${slug}/users/${user.userId}/permissions`}
              className="shrink-0 rounded border border-slate-300 px-3 py-1 text-xs text-slate-700"
            >
              {user.name} の権限を編集
            </Link>
          )}

          {/* 自分を消せると、権限を持つ最後の 1 人が抜けて誰も操作できなくなり得る。
              ボタンを隠すのは体感のためで、拒否の境界は Server Action 側にある。 */}
          {canRemove && user.userId !== currentUserId && (
            <RemoveUserButton slug={slug} user={user} action={removeAction} />
          )}
        </li>
      ))}
    </ul>
  );
}
