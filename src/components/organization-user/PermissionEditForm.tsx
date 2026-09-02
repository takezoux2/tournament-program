"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  OrganizationUserSummary,
  PermissionSummary,
} from "@/features/organization-user/repository";
import {
  INITIAL_ORGANIZATION_USER_FORM_STATE,
  type OrganizationUserFormAction,
} from "@/features/organization-user/state";
import { UserAvatar } from "./UserAvatar";

/** 自分から外せない権限。外すと誰も権限を戻せなくなる。 */
const SELF_LOCKED_CODE = "user.grant";

export function PermissionEditForm({
  slug,
  user,
  permissions,
  isSelf,
  action,
}: {
  slug: string;
  user: OrganizationUserSummary;
  permissions: PermissionSummary[];
  isSelf: boolean;
  action: OrganizationUserFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_USER_FORM_STATE,
  );
  const held = new Set(user.permissionCodes);
  const lockGrant = isSelf && held.has(SELF_LOCKED_CODE);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={user.userId} />
      {/* disabled なチェックボックスは送信されないため、固定分は hidden で補う。 */}
      {lockGrant && (
        <input type="hidden" name="permissionCode" value={SELF_LOCKED_CODE} />
      )}

      <div className="flex items-center gap-3">
        <UserAvatar name={user.name} image={user.image} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {user.name}
          </p>
          <p className="truncate text-xs text-slate-500">{user.username}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {permissions.map((permission) => {
          const locked = lockGrant && permission.code === SELF_LOCKED_CODE;
          return (
            <li key={permission.id}>
              <label
                htmlFor={`permission-${permission.id}`}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  id={`permission-${permission.id}`}
                  type="checkbox"
                  name="permissionCode"
                  value={permission.code}
                  defaultChecked={held.has(permission.code)}
                  disabled={locked}
                  className="h-4 w-4"
                />
                <span>{permission.description}</span>
                <span className="text-xs text-slate-400">
                  {permission.code}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {lockGrant && (
        <p className="text-xs text-slate-500">
          自分自身から「{SELF_LOCKED_CODE}」を外すことはできません
        </p>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
        <Link
          href={`/orgs/${slug}/users`}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
