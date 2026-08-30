import Link from "next/link";
import type { OrganizationSummary } from "@/features/organization/repository";

export function OrganizationList({
  organizations,
}: {
  organizations: OrganizationSummary[];
}) {
  if (organizations.length === 0) {
    return <p className="text-sm text-slate-600">まだ組織がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {organizations.map((organization) => (
        <li
          key={organization.id}
          className="rounded border border-slate-200 bg-white px-4 py-3"
        >
          <Link
            href={`/orgs/${organization.slug}`}
            className="font-medium text-slate-800 underline"
          >
            {organization.name}
          </Link>
          <p className="text-xs text-slate-500">{organization.slug}</p>
        </li>
      ))}
    </ul>
  );
}
