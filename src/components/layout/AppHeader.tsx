import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";

export type Crumb = {
  label: string;
  /** 省略した場合は現在地としてリンクにしない。 */
  href?: string;
};

export function AppHeader({
  crumbs,
  userName,
}: {
  crumbs: Crumb[];
  userName: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <nav aria-label="パンくず" className="flex items-center gap-2 text-sm">
        {crumbs.map((crumb, index) => (
          <span
            key={crumb.href ?? crumb.label}
            className="flex items-center gap-2"
          >
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
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-700">{userName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
