import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "トーナメント表",
  description: "シングルエリミネーションのトーナメント表",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>
        {children}
        {/* 測定 ID の有無は GoogleAnalytics 自身が見て、無ければ何も描かない。
            ここで判定して prop で渡すと、スクリプトを読むかどうかと
            イベントを送るかどうかが別々の値を見ることになる。
            <html> の直下ではなく body の中に置くこと。直下だと React が
            「script を入れ子にできない」と警告する。 */}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
