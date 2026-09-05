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
 * だと、flex item の自動最小サイズ（min-content サイズ）がその文字列の幅で
 * 決まってしまい、それだけではページ全体が横スクロールしてしまう。
 * wrap-break-word（overflow-wrap: break-word）は見た目の折り返しには効くが
 * 内在サイズ（intrinsic size）には影響しないため、これだけでは直らない。
 * wrap-anywhere（overflow-wrap: anywhere）は内在サイズ自体を縮めるため、
 * Link とプレーンな span の両方のラベルに付けている。
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
              <Link
                href={crumb.href}
                className="wrap-anywhere text-slate-600 underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="wrap-anywhere font-bold text-slate-800">
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
