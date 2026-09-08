import { AppHeader } from "@/components/layout/AppHeader";
import { DeleteAccountForm } from "@/components/profile/DeleteAccountForm";
import { DisplayNameForm } from "@/components/profile/DisplayNameForm";
import { EmailSection } from "@/components/profile/EmailSection";
import { LinkedAccountsSection } from "@/components/profile/LinkedAccountsSection";
import { PasswordSection } from "@/components/profile/PasswordSection";
import { RevokeSessionsForm } from "@/components/profile/RevokeSessionsForm";
import { changeEmailAction } from "@/features/user/change-email/handler";
import { changePasswordAction } from "@/features/user/change-password/handler";
import { deleteAccountAction } from "@/features/user/delete-account/handler";
import { linkGoogleAction } from "@/features/user/link-google/handler";
import { findLinkedAccounts } from "@/features/user/repository";
import { revokeOtherSessionsAction } from "@/features/user/revoke-sessions/handler";
import { setPasswordAction } from "@/features/user/set-password/handler";
import { unlinkGoogleAction } from "@/features/user/unlink-account/handler";
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
        userEmail={session.user.email}
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
          <h2 className="text-sm font-bold text-slate-800">メールアドレス</h2>
          <EmailSection
            currentEmail={session.user.email}
            action={changeEmailAction}
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

        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">連携アカウント</h2>
          <LinkedAccountsSection
            google={linkedAccounts.google}
            hasPassword={linkedAccounts.hasPassword}
            linkAction={linkGoogleAction}
            unlinkAction={unlinkGoogleAction}
          />
        </section>

        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">セキュリティ</h2>
          <RevokeSessionsForm action={revokeOtherSessionsAction} />
        </section>

        <section className="space-y-4 rounded border border-red-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-red-700">アカウントの削除</h2>
          <DeleteAccountForm action={deleteAccountAction} />
        </section>
      </div>
    </main>
  );
}
