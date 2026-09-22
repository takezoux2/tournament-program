"use client";

import Link from "next/link";
import { type PrintOptions, printHref } from "@/features/print/options";

const Choice = ({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) => (
  <Link
    href={href}
    aria-current={active ? "true" : undefined}
    className={`rounded px-3 py-1 ${
      active
        ? "bg-slate-800 font-medium text-white"
        : "border border-slate-300 bg-white text-slate-700"
    }`}
  >
    {children}
  </Link>
);

/**
 * 印刷ページ上部の操作欄。切替はクエリを書き換えたリンクで行い、表そのものは
 * サーバーで描き直す(設定を URL に残すので、同じ設定のまま共有・再印刷できる)。
 * 紙には出さない。
 */
export function PrintToolbar({
  tournamentId,
  options,
}: {
  tournamentId: string;
  options: PrintOptions;
}) {
  const href = (next: Partial<PrintOptions>) =>
    printHref(tournamentId, { ...options, ...next });

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 text-sm print:hidden">
      <Link href={`/t/${tournamentId}`} className="text-slate-600 underline">
        大会ページへ戻る
      </Link>
      <fieldset aria-label="用紙サイズ" className="flex gap-1 border-0 p-0">
        <Choice href={href({ paper: "a4" })} active={options.paper === "a4"}>
          A4
        </Choice>
        <Choice href={href({ paper: "a3" })} active={options.paper === "a3"}>
          A3
        </Choice>
      </fieldset>
      <fieldset aria-label="試合結果" className="flex gap-1 border-0 p-0">
        <Choice href={href({ results: true })} active={options.results}>
          結果あり
        </Choice>
        <Choice href={href({ results: false })} active={!options.results}>
          空欄
        </Choice>
      </fieldset>
      <button
        type="button"
        onClick={() => window.print()}
        className="ml-auto rounded bg-slate-800 px-4 py-2 font-medium text-white"
      >
        印刷 / PDFに保存
      </button>
    </div>
  );
}
