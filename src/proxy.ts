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
 * （Prisma の where 句で「公開状態、または閲覧者がその大会の組織メンバーで
 * あること」を許可する）である。未ログインの閲覧者には公開状態しか
 * 許可されないため、ここで素通しにしても準備中の大会は漏れない。
 * 除外パターンは "t" ではなく "t/"（末尾のスラッシュ込み）にすること。
 * "t" だけだと /tournaments や /teams のような t で始まる将来の
 * 管理系パスまで誤って除外し、認証をすり抜けさせてしまう。
 * 公開ページは4つとも /t の後に必ずパスセグメントが続くため、
 * "t/" 要求で十分かつ安全。
 *
 * /forgot-password と /reset-password も同様にこの最適化から除外する。
 * この2画面はセッション Cookie を持たないユーザーのためだけに存在する
 * （パスワードを忘れてログインできない人、メールのリンクから来た人）。
 * ここを保護ページ扱いにすると /login にリダイレクトされ続け、機能全体に
 * ブラウザから到達できなくなる。
 * どちらもサブパスを持たない末端ページなので、除外パターンは
 * "forgot-password$" / "reset-password$" のように末尾を "$" で固定する。
 * "t/" のケースと逆の理由で、こちらは前方一致のままだと将来
 * "/forgot-password-history" のような別ページ（例: 申請履歴の管理画面）まで
 * 名前が前方一致するだけで誤って除外し、認証をすり抜けさせてしまうため。
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
  // 認証エンドポイントとログイン系の画面（ログイン・サインアップ・
  // パスワードを忘れた・パスワード再設定）、静的アセット、
  // 公開ツアー閲覧ページ (/t/...) は除外する。
  // forgot-password / reset-password はセッションを持たないユーザー専用の
  // 画面のため公開必須。他ページとの前方一致事故を避けるため "$" で
  // 末尾を固定している（詳細は上のコメント参照）。
  matcher: [
    "/((?!api/auth|login|signup|t/|forgot-password$|reset-password$|_next/static|_next/image|favicon.ico).*)",
  ],
};
