"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  SELF_LOCKED_CODES,
  SELF_LOCKED_MESSAGE,
} from "@/features/organization-user/grant/domain";
import type {
  OrganizationUserSummary,
  PermissionSummary,
} from "@/features/organization-user/repository";
import {
  INITIAL_ORGANIZATION_USER_FORM_STATE,
  type OrganizationUserFormAction,
} from "@/features/organization-user/state";
import { UserAvatar } from "./UserAvatar";

export function PermissionEditForm({
  slug,
  user,
  permissions,
  isSelf,
  canViewUsers,
  action,
}: {
  slug: string;
  user: OrganizationUserSummary;
  permissions: PermissionSummary[];
  isSelf: boolean;
  /** 一覧（/orgs/[slug]/users）は user.view を要求するため、無ければ戻り先を変える。 */
  canViewUsers: boolean;
  action: OrganizationUserFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_USER_FORM_STATE,
  );
  const held = new Set(user.permissionCodes);
  // 元々持っていない権限は外しようがないので、ロックの対象にしない。
  const lockedCodes = isSelf
    ? SELF_LOCKED_CODES.filter((code) => held.has(code))
    : [];
  const cancelHref = canViewUsers ? `/orgs/${slug}/users` : `/orgs/${slug}`;

  return (
    <form
      action={formAction}
      className="space-y-4 rounded border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={user.userId} />
      {/* disabled なチェックボックスは送信されないため、固定分は hidden で補う。 */}
      {lockedCodes.map((code) => (
        <input key={code} type="hidden" name="permissionCode" value={code} />
      ))}

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
          const locked = lockedCodes.some((code) => code === permission.code);
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

      {lockedCodes.length > 0 && (
        <p className="text-xs text-slate-500">{SELF_LOCKED_MESSAGE}</p>
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
          href={cancelHref}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
