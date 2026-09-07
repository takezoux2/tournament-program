"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { sendGtagEvent } from "@/shared/lib/analytics/gtag";
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
 * クエリを落とし ID を伏せたパスだけを送る。GA4 側の拡張計測
 * 「ブラウザの履歴イベントに基づくページの変更」は必ず切ること。
 * 切らないと GA が素の URL でも page_view を送ってしまう。
 *
 * js / config の送出は sendGtagEvent が面倒を見る。ここでインライン
 * スクリプトを描かないのは、beforeInteractive が 404 などシェルの
 * 差し替わるページで出力されず、window.gtag 未定義で落ちるため。
 */
export function GoogleAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();

  // 直前に送ったパス。StrictMode は開発時に effect を
  // setup → cleanup → setup と 2 回走らせるため、素直に書くと同じ
  // ページビューが 2 回飛ぶ。本番の挙動は変わらないが、開発サーバに
  // ステージング用の測定 ID を向ける使い方を想定しているので、
  // そこで数字が倍にならないようにしておく。ref は StrictMode の
  // 再実行をまたいで保持されるので、これで 1 回に落ちる。
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;
    sendGtagEvent("page_view", {
      page_location: window.location.origin + sanitizePagePath(pathname),
    });
  }, [pathname]);

  return (
    <Script
      id="ga-src"
      src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
    />
  );
}
