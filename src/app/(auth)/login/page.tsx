import { LoginForm } from "@/components/auth/LoginForm";
import { safeRedirectPath } from "@/features/auth/domain";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.redirect;
  const redirectTo = safeRedirectPath(typeof raw === "string" ? raw : null);

  // 確認メールのリンクから戻ってきた場合に付く 2 つのクエリ。
  // error は Better Auth が verify-email の失敗時に足す内部コードなので、
  // 文言への写像は LoginForm 側で行い、ここでは素通しする。
  const verified = params.verified === "1";
  const rawError = params.error;
  const verifyError = typeof rawError === "string" ? rawError : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <LoginForm
        redirectTo={redirectTo}
        verified={verified}
        verifyError={verifyError}
      />
    </main>
  );
}
