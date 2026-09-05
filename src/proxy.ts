import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
  BYPASS_USER_ID_COOKIE,
  isAuthBypassEnabled,
} from "@/shared/lib/auth-bypass";

/**
 * 未ログインのまま保護ページを開いたときに、レンダリングを始める前に
 * /login へ送るための最適化。
 *
 * セッション Cookie の「存在」しか見ておらず署名も有効期限も検証していない。
 * ここを通過したことは認証済みを意味しない。実際の境界は requireSession()。
 *
 * /t/... （/t/[tournamentId] 配下の公開ページ）はこの最適化の対象から
 * 除外している。これらのページは設計上ログイン不要で公開されており、
 * その境界は requireSession() ではなく findPublicTournament の絞り込み
 * （Prisma の where 句で DRAFT を除外する）である。
 * 除外パターンは "t" ではなく "t/"（末尾のスラッシュ込み）にすること。
 * "t" だけだと /tournaments や /teams のような t で始まる将来の
 * 管理系パスまで誤って除外し、認証をすり抜けさせてしまう。
 * 公開ページは4つとも /t の後に必ずパスセグメントが続くため、
 * "t/" 要求で十分かつ安全。
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  // 開発用バイパス（BYPASS_AUTH=1）。requireSession() 側で USER_ID を
  // 引き当てるので、ここでは Cookie の存在だけ見て素通しする。
  // 存在しないユーザー ID なら requireSession() が /login へ送る。
  if (isAuthBypassEnabled() && request.cookies.get(BYPASS_USER_ID_COOKIE)) {
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
  // 認証エンドポイントとログイン系の画面、静的アセット、
  // 公開ツアー閲覧ページ (/t/...) は除外する。
  matcher: [
    "/((?!api/auth|login|signup|t/|_next/static|_next/image|favicon.ico).*)",
  ],
};
