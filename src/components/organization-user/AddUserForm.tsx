"use client";

import { useActionState } from "react";
import {
  INITIAL_ORGANIZATION_USER_FORM_STATE,
  INITIAL_USER_SEARCH_STATE,
  type OrganizationUserFormAction,
  type UserSearchAction,
} from "@/features/organization-user/state";
import { UserAvatar } from "./UserAvatar";

/**
 * 検索と追加で別の form にしているのは、1 つの form が持てる action が
 * 1 つだけだから。検索結果は searchState に残るので、追加の送信後も
 * 確認欄は消えずに残る。
 */
export function AddUserForm({
  slug,
  searchAction,
  addAction,
}: {
  slug: string;
  searchAction: UserSearchAction;
  addAction: OrganizationUserFormAction;
}) {
  const [searchState, runSearch, searching] = useActionState(
    searchAction,
    INITIAL_USER_SEARCH_STATE,
  );
  const [addState, runAdd, adding] = useActionState(
    addAction,
    INITIAL_ORGANIZATION_USER_FORM_STATE,
  );

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-700">ユーザーを追加</h2>

      <form action={runSearch} className="space-y-2">
        <input type="hidden" name="slug" value={slug} />
        <label
          htmlFor="query"
          className="block text-sm font-medium text-slate-700"
        >
          ユーザー名またはメールアドレス
        </label>
        <div className="flex gap-2">
          <input
            id="query"
            name="query"
            type="text"
            required
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </div>
        <p className="text-xs text-slate-500">完全一致で 1 件だけ探します</p>
        {searchState.error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {searchState.error}
          </p>
        )}
      </form>

      {searchState.user !== null && (
        <form
          action={runAdd}
          className="flex items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="userId" value={searchState.user.id} />

          <UserAvatar
            name={searchState.user.name}
            image={searchState.user.image}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {searchState.user.name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {searchState.user.username}
            </p>
          </div>

          {searchState.user.alreadyMember ? (
            <p className="shrink-0 text-xs text-slate-500">
              既に所属しています
            </p>
          ) : (
            <button
              type="submit"
              disabled={adding}
              className="shrink-0 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {adding ? "追加中..." : "追加"}
            </button>
          )}
        </form>
      )}

      {addState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {addState.error}
        </p>
      )}
    </section>
  );
}
