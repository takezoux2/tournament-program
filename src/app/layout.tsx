import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "トーナメント表",
  description: "シングルエリミネーションのトーナメント表",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
