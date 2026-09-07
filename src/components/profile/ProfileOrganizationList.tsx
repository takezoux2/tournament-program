import Link from "next/link";
import type { MembershipSummary } from "@/features/organization/repository";

export function ProfileOrganizationList({
  memberships,
}: {
  memberships: MembershipSummary[];
}) {
  if (memberships.length === 0) {
    return (
      <p className="text-sm text-slate-600">所属している組織はありません</p>
    );
  }

  return (
    <ul className="space-y-3">
      {memberships.map((membership) => (
        <li
          key={membership.id}
          className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <div>
            <Link
              href={`/orgs/${membership.slug}`}
              className="font-medium text-slate-800 underline"
            >
              {membership.name}
            </Link>
            <p className="text-xs text-slate-500">
              {membership.slug} ・{" "}
              {membership.joinedAt.toLocaleDateString("ja-JP")} 参加
            </p>
          </div>

          {membership.permissions.length === 0 ? (
            <p className="text-xs text-slate-500">権限はありません</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {membership.permissions.map((permission) => (
                // 画面にはコードではなく説明を出す。コードは内部の識別子で、
                // 読み手に意味が伝わらない。
                <li
                  key={permission.code}
                  className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                >
                  {permission.description}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
