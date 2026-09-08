import Link from "next/link";
import { UserMenu } from "@/components/layout/UserMenu";

export type Crumb = {
  label: string;
  /** 省略した場合は現在地としてリンクにしない。 */
  href?: string;
};

export function AppHeader({
  crumbs,
  userName,
  userEmail,
}: {
  crumbs: Crumb[];
  userName: string;
  userEmail: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <nav aria-label="パンくず" className="flex items-center gap-2 text-sm">
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
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  );
}
