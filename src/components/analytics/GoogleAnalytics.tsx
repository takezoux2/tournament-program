"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";
import { sanitizePagePath } from "@/shared/lib/analytics/sanitize-url";

/**
 * gtag.js を読み込み、ページビューを自前で送る。
 *
 * @next/third-parties の GoogleAnalytics を使わないのは、あれが
 * gtag('config', ...) に追加パラメータを渡す口を持たないため。
 * 既定の config は即座に page_location（クエリ込みの完全 URL）で
 * page_view を送ってしまい、差し替える隙が無い。
 * パスワード再設定は /reset-password?token=... というページなので、
 * そのままでは有効なトークンが Google に保存される。
 *
 * send_page_view: false にして、クエリを落とし ID を伏せたパスだけを送る。
 * GA4 側の拡張計測「ブラウザの履歴イベントに基づくページの変更」は必ず
 * 切ること。切らないと GA が素の URL でも page_view を送ってしまう。
 */
export function GoogleAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();

  // 初回もクライアント遷移も、同じ経路で 1 回ずつ送る。初回だけ config に
  // 兼ねさせると、送信経路が 2 つになり片方だけサニタイズし忘れる。
  useEffect(() => {
    window.gtag("event", "page_view", {
      page_location: window.location.origin + sanitizePagePath(pathname),
    });
  }, [pathname]);

  return (
    <>
      <Script
        id="ga-bootstrap"
        strategy="beforeInteractive"
        // gtag のブートストラップは Google が指定するインラインスクリプトの
        // 形でしか書けない。埋め込む値は測定 ID だけで、JSON.stringify を通す。
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 上記のとおり
        dangerouslySetInnerHTML={{
          __html: [
            "window.dataLayer = window.dataLayer || [];",
            "function gtag(){dataLayer.push(arguments);}",
            "window.gtag = gtag;",
            "gtag('js', new Date());",
            `gtag('config', ${JSON.stringify(gaId)}, { send_page_view: false });`,
          ].join("\n"),
        }}
      />
      <Script
        id="ga-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
      />
    </>
  );
}
