import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import {
  toMatchNumberView,
  toSetupView,
} from "@/features/division/single-elimination/view";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { AddEntryForm } from "./AddEntryForm";
import { DivisionBracket } from "./DivisionBracket";
import { EntryList } from "./EntryList";
import { MatchingSection } from "./MatchingSection";
import { MatchNumberList } from "./MatchNumberList";

export type DivisionSetupActions = {
  addEntry: DivisionFormAction;
  removeEntry: DivisionFormAction;
  reorderEntry: DivisionFormAction;
  generateMatching: DivisionFormAction;
  swapSlots: DivisionFormAction;
  setMatchNumber: DivisionFormAction;
};

const Notice = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
    {children}
  </p>
);

export function DivisionSetup({
  division,
  participants,
  members,
  slug,
  tournamentId,
  actions,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  members: MemberSummary[];
  slug: string;
  tournamentId: string;
  actions: DivisionSetupActions;
}) {
  // 描画側と同じ理由で、他の形式は編集に対応していない。
  if (division.format !== "SINGLE_ELIMINATION") {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[division.format]}
        」のエントリー編集はまだ対応していません
      </Notice>
    );
  }

  // Json は DB の列で、アプリの外から壊れた値が入りうる。パースの失敗は
  // ここで受け止め、ページ全体は落とさない。
  let parsed: {
    entries: ReturnType<typeof parseDivisionEntries>;
    matchingConfig: ReturnType<typeof parseMatchingConfig>;
    results: ReturnType<typeof parseDivisionResults>;
  };
  try {
    parsed = {
      entries: parseDivisionEntries(division.entries),
      matchingConfig: parseMatchingConfig(division.matchingConfig),
      results: parseDivisionResults(division.results),
    };
  } catch {
    return <Notice>部門のデータを読み込めませんでした</Notice>;
  }

  // 勝敗が入ったあとに組み合わせを変えると結果の参照が壊れる。
  // サーバ側でも拒否するが、押せてしまう前に理由を見せる。
  const locked = parsed.results.matches.length > 0;

  const entries = [...parsed.entries.entries].sort(
    (left, right) => left.seed - right.seed,
  );

  return (
    <div className="space-y-6">
      {locked && (
        <output className="block rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          勝敗が記録されているため、エントリーと組み合わせは変更できません
        </output>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">エントリー</h2>
        <EntryList
          entries={entries}
          participants={participants}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          reorderAction={actions.reorderEntry}
          removeAction={actions.removeEntry}
          disabled={locked}
        />
        <AddEntryForm
          action={actions.addEntry}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          members={members}
          disabled={locked}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">組み合わせ</h2>
        <MatchingSection
          matches={toSetupView(
            parsed.matchingConfig,
            parsed.entries,
            participants,
          )}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          generateAction={actions.generateMatching}
          swapAction={actions.swapSlots}
          disabled={locked}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">試合番号</h2>
        {/* 番号の変更は構造を変えないため、locked でも編集できる */}
        <MatchNumberList
          rows={toMatchNumberView(
            parsed.matchingConfig,
            parsed.entries,
            participants,
          )}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          action={actions.setMatchNumber}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">プレビュー</h2>
        <DivisionBracket division={division} participants={participants} />
      </section>
    </div>
  );
}
