import { AppHeader } from "@/components/layout/AppHeader";
import { DeleteOrganizationForm } from "@/components/organization/DeleteOrganizationForm";
import { OrganizationForm } from "@/components/organization/OrganizationForm";
import { deleteOrganizationAction } from "@/features/organization/delete/handler";
import { updateOrganizationAction } from "@/features/organization/update/handler";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function EditOrganizationPage({
  params,
}: PageProps<"/orgs/[slug]/edit">) {
  const { slug } = await params;
  const { session, organization } = await requireOrganization(slug);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "編集" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-sm space-y-8 px-6 py-8">
        <div className="space-y-4">
          <h1 className="text-lg font-bold text-slate-800">組織を編集</h1>
          <OrganizationForm
            action={updateOrganizationAction}
            submitLabel="保存する"
            defaultName={organization.name}
            fixedSlug={organization.slug}
          />
        </div>

        <DeleteOrganizationForm
          action={deleteOrganizationAction}
          organizationName={organization.name}
          slug={organization.slug}
        />
      </div>
    </main>
  );
}
