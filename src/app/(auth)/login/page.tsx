import { LoginForm } from "@/components/auth/LoginForm";
import { safeRedirectPath } from "@/features/auth/login/domain";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.redirect;
  const redirectTo = safeRedirectPath(typeof raw === "string" ? raw : null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <LoginForm redirectTo={redirectTo} />
    </main>
  );
}
