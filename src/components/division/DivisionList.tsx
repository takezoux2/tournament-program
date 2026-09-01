import Link from "next/link";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionSummary } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionReorderButtons } from "./DivisionReorderButtons";

export function DivisionList({
  slug,
  tournamentId,
  divisions,
  reorderAction,
}: {
  slug: string;
  tournamentId: string;
  /** order 昇順で渡す。端の判定にこの並びを使う。 */
  divisions: DivisionSummary[];
  reorderAction: DivisionFormAction;
}) {
  if (divisions.length === 0) {
    return <p className="text-sm text-slate-600">まだ部門がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {divisions.map((division, index) => (
        <li
          key={division.id}
          className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <div>
            <Link
              href={`/orgs/${slug}/tournaments/${tournamentId}/divisions/${division.id}`}
              className="font-medium text-slate-800 underline"
            >
              {division.name}
            </Link>
            <p className="text-xs text-slate-500">
              {DIVISION_FORMAT_LABELS[division.format]}
            </p>
          </div>

          <DivisionReorderButtons
            action={reorderAction}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            canMoveUp={index > 0}
            canMoveDown={index < divisions.length - 1}
          />
        </li>
      ))}
    </ul>
  );
}
