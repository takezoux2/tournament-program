import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 未ログインのまま保護ページを開いたときに、レンダリングを始める前に
 * /login へ送るための最適化。
 *
 * セッション Cookie の「存在」しか見ておらず署名も有効期限も検証していない。
 * ここを通過したことは認証済みを意味しない。実際の境界は requireSession()。
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "redirect",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 認証エンドポイントとログイン系の画面、静的アセットは除外する。
  matcher: [
    "/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)",
  ],
};
