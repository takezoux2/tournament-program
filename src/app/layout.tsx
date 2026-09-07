import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { gaMeasurementId } from "@/shared/lib/analytics/ga-id";
import "./globals.css";

export const metadata: Metadata = {
  title: "トーナメント表",
  description: "シングルエリミネーションのトーナメント表",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // 測定 ID が無い環境では GoogleAnalytics ごと描画しない。
  // gtag.js の読み込みも dataLayer の初期化も起きない。
  const gaId = gaMeasurementId();

  return (
    <html lang="ja">
      <body>{children}</body>
      {gaId !== null && <GoogleAnalytics gaId={gaId} />}
    </html>
  );
}
