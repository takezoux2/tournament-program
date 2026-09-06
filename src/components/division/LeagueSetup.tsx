import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isRoundRobinShape } from "@/features/division/round-robin/build";
import {
  toCrossTableView,
  toRoundView,
} from "@/features/division/round-robin/view";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { AddEntryForm } from "./AddEntryForm";
import { EntryList } from "./EntryList";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { LeagueCrossTable } from "./LeagueCrossTable";
import { LeagueRoundList } from "./LeagueRoundList";
import { Notice } from "./Notice";

/**
 * トーナメントの DivisionSetup と違い swapSlots を取らない。
 * 1 回戦スロットの入れ替えは総当たりに意味が無いため。
 */
export type LeagueSetupActions = {
  addEntry: DivisionFormAction;
  removeEntry: DivisionFormAction;
  reorderEntry: DivisionFormAction;
  generateMatching: DivisionFormAction;
  setMatchNumber: DivisionFormAction;
  setPlayerNumber: DivisionFormAction;
};

export function LeagueSetup({
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
  actions: LeagueSetupActions;
}) {
  // ページ側でも弾いているが、この画面はリーグ専用であることを型より外でも守る。
  if (division.format !== "ROUND_ROBIN") {
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

  // 勝敗が入ったあとに対戦表を変えると結果の参照が壊れる。
  // サーバ側でも拒否するが、押せてしまう前に理由を見せる。
  //
  // locked と後述の mismatched（星取表の形が違う）は両方成立しうる。
  // その場合「作り直してください」という案内なのに、生成ボタンではなく
  // locked が締める側（エントリー・対戦表の編集）が効いて詰む見た目になる。
  // 今は Division.results を書く経路が無い（recordMatchResult
  // （src/lib/division/results.ts）に呼び出し元が無い）ので locked は
  // 常に false であり到達しない。結果記録を実装するときは見直すこと。
  const locked = parsed.results.matches.length > 0;

  const entries = [...parsed.entries.entries].sort(
    (left, right) => left.seed - right.seed,
  );

  // /edit は format を無条件に書き換えられるので、トーナメントの木を
  // 持ったままリーグになった部門が存在しうる。その木を星取表として
  // 描くと嘘になるため、作り直しを促すだけにする。
  const mismatched = !isRoundRobinShape(parsed.matchingConfig);

  return (
    <div className="space-y-6">
      {locked && (
        <output className="block rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          勝敗が記録されているため、エントリーと対戦表は変更できません
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
        <h2 className="text-sm font-bold text-slate-700">対戦表</h2>
        <GenerateMatchingForm
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          action={actions.generateMatching}
          disabled={locked}
          label="対戦表を生成"
        />
        {mismatched ? (
          <Notice>
            この対戦表はリーグの形ではありません。作り直してください
          </Notice>
        ) : (
          <LeagueCrossTable
            table={toCrossTableView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
            )}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">節ごとの試合</h2>
        {/* 番号の変更は構造を変えないため、locked でも編集できる */}
        {mismatched ? (
          <Notice>対戦表を作り直すと、ここに節ごとの試合が出ます</Notice>
        ) : (
          <LeagueRoundList
            rounds={toRoundView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            action={actions.setMatchNumber}
          />
        )}
      </section>
    </div>
  );
}
