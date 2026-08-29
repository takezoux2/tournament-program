import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/shared/lib/auth";
import { getBypassSession } from "@/shared/lib/auth-bypass-session";

/**
 * 認証の実際のセキュリティ境界。保護したい Server Component / Server Action の
 * 冒頭で必ず呼ぶ。proxy.ts の Cookie チェックは体感速度のための最適化であって
 * 署名検証をしていないため、境界として当てにしてはならない。
 */
export const requireSession = async () => {
  // 開発用バイパス（BYPASS_AUTH=1）。有効なときだけ非 null が返るため、
  // 未設定の通常運用では以降の処理はこれまでと完全に同じ。
  const bypassSession = await getBypassSession();
  if (bypassSession) {
    return bypassSession;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  return session;
};
