import { SignupForm } from "@/components/auth/SignupForm";
import { safeRedirectPath } from "@/features/auth/domain";

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const params = await searchParams;
  const raw = params.redirect;
  const redirectTo = safeRedirectPath(typeof raw === "string" ? raw : null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <SignupForm redirectTo={redirectTo} />
    </main>
  );
}
