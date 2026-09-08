import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const params = await searchParams;

  // Better Auth の reset-password/:token がここへリダイレクトする際に付ける
  // 2 つのクエリ。有効なら token、無効・期限切れなら error=INVALID_TOKEN。
  // 文言への写像は resetTokenState が行うので、ここでは素通しする。
  const rawToken = params.token;
  const rawError = params.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <ResetPasswordForm
        token={typeof rawToken === "string" ? rawToken : null}
        errorCode={typeof rawError === "string" ? rawError : null}
      />
    </main>
  );
}
