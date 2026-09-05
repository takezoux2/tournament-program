import Link from "next/link";

export type PublicCrumb = {
  label: string;
  /** 省略した場合は現在地としてリンクにしない。 */
  href?: string;
};

/**
 * 公開ページのヘッダ。AppHeader を流用しないのは、あちらが userName を必須に持ち
 * LogoutButton（クライアントコンポーネント）を含むため。ログイン前提の部品を
 * 公開側へ持ち込まない。
 *
 * 狭い画面では折り返す。大会名が長いと 1 行に収まらず、はみ出すと
 * ページ全体が横スクロールしてしまう。
 */
export function PublicHeader({ crumbs }: { crumbs: PublicCrumb[] }) {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3">
      <nav
        aria-label="パンくず"
        className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 text-sm"
      >
        {crumbs.map((crumb, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumbs はレンダーごとに固定で並び替えもしないためインデックスで安全
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-400">/</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="text-slate-600 underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-bold text-slate-800">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
