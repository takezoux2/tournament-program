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
 * 狭い画面では折り返す。nav の flex-wrap はパンくず同士の折り返しは
 * 面倒を見るが、1 つのラベルが区切りなしの長い文字列（英数字の名前など）
 * だと flex item は既定で縮まないため、それだけではページ全体が横スクロール
 * してしまう。ラベルの span に min-w-0 と wrap-break-word を付けているのは
 * そのため。
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
              <span className="min-w-0 wrap-break-word font-bold text-slate-800">
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
