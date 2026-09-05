import Link from "next/link";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionSummary } from "@/features/division/repository";

/**
 * 公開ページの部門一覧。行全体をリンクにするのは、指で押す対象を
 * 部門名の文字幅ではなく行の高さぶん確保するため（py-3 と 2 行の文字で
 * 44px 相当になる）。
 */
export function PublicDivisionList({
  tournamentId,
  divisions,
}: {
  tournamentId: string;
  /** order 昇順で渡す。並べ替えはしない。 */
  divisions: DivisionSummary[];
}) {
  if (divisions.length === 0) {
    return <p className="text-sm text-slate-600">まだ部門がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {divisions.map((division) => (
        <li key={division.id}>
          <Link
            href={`/t/${tournamentId}/divisions/${division.id}`}
            className="block rounded border border-slate-200 bg-white px-4 py-3"
          >
            <span className="block font-medium text-slate-800 underline">
              {division.name}
            </span>
            <span className="block text-xs text-slate-500">
              {DIVISION_FORMAT_LABELS[division.format]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
