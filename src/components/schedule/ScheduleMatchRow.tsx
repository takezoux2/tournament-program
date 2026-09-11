"use client";

import type { ScheduleRowView } from "@/features/schedule/types";

type MatchRow = Extract<ScheduleRowView, { kind: "match" }>;

export function ScheduleMatchRow({ row }: { row: MatchRow }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-sm text-slate-800">
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
          {row.matchName}
        </span>
        <span className="truncate font-medium">{row.card}</span>
      </p>
      <p className="truncate text-xs text-slate-500">
        {row.divisionName} / {row.label}
      </p>
    </div>
  );
}
