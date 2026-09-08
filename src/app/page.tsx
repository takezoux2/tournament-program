import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { OrganizationList } from "@/components/organization/OrganizationList";
import { listOrganizationsForUser } from "@/features/organization/repository";
import { requireSession } from "@/shared/middleware/require-session";

export default async function Home() {
  const session = await requireSession();
  const organizations = await listOrganizationsForUser(session.user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "組織" }]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">組織</h1>
          <Link
            href="/orgs/new"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            組織を作成
          </Link>
        </div>

        <OrganizationList organizations={organizations} />
      </div>
    </main>
  );
}
