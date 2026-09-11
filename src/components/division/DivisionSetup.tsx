import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import { toMatchOrderView } from "@/features/division/match-name-view";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isSingleEliminationShape } from "@/features/division/single-elimination/build";
import { toSetupView } from "@/features/division/single-elimination/view";
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
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { MatchingSection } from "./MatchingSection";
import { MatchOrderList } from "./MatchOrderList";
import { Notice } from "./Notice";

export type DivisionSetupActions = {
  addEntry: DivisionFormAction;
  removeEntry: DivisionFormAction;
  reorderEntry: DivisionFormAction;
  generateMatching: DivisionFormAction;
  swapSlots: DivisionFormAction;
  reorderMatches: DivisionFormAction;
  setMatchName: DivisionFormAction;
  setPlayerNumber: DivisionFormAction;
};

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
  // ページ側で弾いているため実際には届かないが、防御的にこの画面が
  // トーナメント専用であることを型より外でも守っておく。リーグの
  // エントリー編集は /league に既にあるので「対応していない」は事実と
  // 違う。LeagueSetup.tsx の同種の案内と同じ言い回しにする。
  if (division.format !== "SINGLE_ELIMINATION") {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[division.format]}
        」はこの画面では編集できません
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

  // /edit は format を無条件に書き換えられるので、リーグの星取表を
  // 持ったままトーナメントになった部門が存在しうる。その星取表を
  // D&D エディタに通すと 1 回戦以外が消えるため、作り直しを促すだけにする。
  const mismatched = !isSingleEliminationShape(parsed.matchingConfig);

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
          setPlayerNumberAction={actions.setPlayerNumber}
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
        {mismatched ? (
          <>
            {/* 生成ボタンは残す。押せば直る。 */}
            <GenerateMatchingForm
              slug={slug}
              tournamentId={tournamentId}
              divisionId={division.id}
              action={actions.generateMatching}
              disabled={locked}
              label="組み合わせを生成"
            />
            <Notice>
              この組み合わせはトーナメントの形ではありません。作り直してください
            </Notice>
          </>
        ) : (
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
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">試合の実施順</h2>
        {/* 実施順と番号の変更は構造を変えないため、locked でも編集できる */}
        {mismatched ? (
          <Notice>組み合わせを作り直すと、ここに試合の実施順が出ます</Notice>
        ) : (
          <MatchOrderList
            rows={toMatchOrderView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
              division.format,
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            reorderAction={actions.reorderMatches}
            setMatchNameAction={actions.setMatchName}
            emptyMessage="まだ組み合わせがありません"
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">プレビュー</h2>
        <DivisionBracket division={division} participants={participants} />
      </section>
    </div>
  );
}
