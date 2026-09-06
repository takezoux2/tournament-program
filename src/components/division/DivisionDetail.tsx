import Link from "next/link";
import type { DivisionFormat } from "@/generated/prisma/enums";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionDetail } from "@/features/division/repository";
import { formatStartsAt } from "@/features/tournament/format";

/**
 * 形式ごとのエントリー編集画面。null は編集画面を持たない形式。
 * Record のキーを DivisionFormat に固定しているので、enum に値を足して
 * 行き先を書き忘れるとコンパイルエラーになる。
 */
const SETUP_LINKS: Record<
  DivisionFormat,
  { segment: string; label: string } | null
> = {
  SINGLE_ELIMINATION: { segment: "setup", label: "エントリー・組み合わせ" },
  ROUND_ROBIN: { segment: "league", label: "エントリー・対戦表" },
  DOUBLE_ELIMINATION_GRAND_FINAL: null,
  DOUBLE_ELIMINATION_THIRD_PLACE: null,
};

export function DivisionDetailView({
  slug,
  tournamentId,
  division,
}: {
  slug: string;
  tournamentId: string;
  division: DivisionDetail;
}) {
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${division.id}`;
  const setup = SETUP_LINKS[division.format];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h1 className="text-lg font-bold text-slate-800">{division.name}</h1>
        <div className="flex gap-2">
          {/* 編集画面を持たない形式ではボタンを出さない。押しても 404 になる */}
          {setup !== null && (
            <Link
              href={`${base}/${setup.segment}`}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              {setup.label}
            </Link>
          )}
          <Link
            href={`${base}/edit`}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            部門を編集
          </Link>
        </div>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">試合形式</dt>
          <dd className="text-slate-800">
            {DIVISION_FORMAT_LABELS[division.format]}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">作成日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(division.createdAt)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
