import type { Metadata } from "next";

/**
 * 公開ページ（/t/**）はログイン不要で参加者の本名を出す。検索エンジンに
 * 拾われたくないため、ここで静的に noindex を固定する。各ページの
 * generateMetadata はタイトルしか返さず（ゲートに外れたときは {} を返す）
 * robots を持たないため、レイアウトのこの値がマージされてそのまま効く。
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PublicLayout({ children }: LayoutProps<"/t">) {
  return children;
}
