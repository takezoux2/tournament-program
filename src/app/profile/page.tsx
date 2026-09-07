import { AppHeader } from "@/components/layout/AppHeader";
import { DisplayNameForm } from "@/components/profile/DisplayNameForm";
import { PasswordSection } from "@/components/profile/PasswordSection";
import { changePasswordAction } from "@/features/user/change-password/handler";
import { findLinkedAccounts } from "@/features/user/repository";
import { setPasswordAction } from "@/features/user/set-password/handler";
import { updateNameAction } from "@/features/user/update-name/handler";
import { requireSession } from "@/shared/middleware/require-session";

export default async function ProfilePage() {
  const session = await requireSession();
  const linkedAccounts = await findLinkedAccounts(session.user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "プロフィール" }]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-xl space-y-8 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">プロフィール</h1>

        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">基本情報</h2>
          <DisplayNameForm
            action={updateNameAction}
            defaultName={session.user.name}
          />
        </section>

        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">
            {linkedAccounts.hasPassword
              ? "パスワードの変更"
              : "パスワードの設定"}
          </h2>
          <PasswordSection
            hasPassword={linkedAccounts.hasPassword}
            changeAction={changePasswordAction}
            setAction={setPasswordAction}
          />
        </section>
      </div>
    </main>
  );
}
