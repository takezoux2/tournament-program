import { AppHeader } from "@/components/layout/AppHeader";
import { OrganizationForm } from "@/components/organization/OrganizationForm";
import { createOrganizationAction } from "@/features/organization/create/handler";
import { requireSession } from "@/shared/middleware/require-session";

export default async function NewOrganizationPage() {
  const session = await requireSession();

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "組織", href: "/" }, { label: "組織を作成" }]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-sm space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">組織を作成</h1>
        <OrganizationForm
          action={createOrganizationAction}
          submitLabel="作成する"
        />
      </div>
    </main>
  );
}
