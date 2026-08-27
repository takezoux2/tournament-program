import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/shared/lib/auth";

/**
 * 認証の実際のセキュリティ境界。保護したい Server Component / Server Action の
 * 冒頭で必ず呼ぶ。proxy.ts の Cookie チェックは体感速度のための最適化であって
 * 署名検証をしていないため、境界として当てにしてはならない。
 */
export const requireSession = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  return session;
};
