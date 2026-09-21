import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import {
  isSlotBracketFormat,
  matchesSlotBracketShape,
} from "@/features/division/matching-strategy";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { toSetupView } from "@/features/division/single-elimination/view";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import type { ParticipantFormAction } from "@/features/participant/state";
import { AddEntryForm } from "./AddEntryForm";
import { DivisionBracket } from "./DivisionBracket";
import { EntryList } from "./EntryList";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { LockedNotice } from "./LockedNotice";
import { MatchingSection } from "./MatchingSection";
import { MatchNameSection } from "./MatchNameSection";
import { Notice } from "./Notice";
import { parseSetupData } from "./parse-setup-data";

export type DivisionSetupActions = {
  addEntry: DivisionFormAction;
  removeEntry: DivisionFormAction;
  reorderEntry: DivisionFormAction;
  generateMatching: DivisionFormAction;
  swapSlots: DivisionFormAction;
  setMatchName: DivisionFormAction;
  setPlayerNumber: ParticipantFormAction;
};

export function DivisionSetup({
  division,
  participants,
  members,
  slug,
  tournamentId,
  actions,
  overallSeq,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  members: MemberSummary[];
  slug: string;
  tournamentId: string;
  actions: DivisionSetupActions;
  /** 大会全体の通し番号。{{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
}) {
  // ページ側で弾いているため実際には届かないが、防御的にこの画面が
  // トーナメント専用であることを型より外でも守っておく。リーグの
  // エントリー編集は /league に既にあるので「対応していない」は事実と
  // 違う。LeagueSetup.tsx の同種の案内と同じ言い回しにする。
  const format = division.format;
  if (!isSlotBracketFormat(format)) {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[format]}
        」はこの画面では編集できません
      </Notice>
    );
  }

  const parsed = parseSetupData(division);
  if (parsed === null) {
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
  const mismatched = !matchesSlotBracketShape(format, parsed.matchingConfig);

  return (
    <div className="space-y-6">
      {locked && <LockedNotice />}

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

      <MatchNameSection
        division={division}
        entries={parsed.entries}
        matchingConfig={parsed.matchingConfig}
        participants={participants}
        overallSeq={overallSeq}
        slug={slug}
        tournamentId={tournamentId}
        setMatchNameAction={actions.setMatchName}
        mismatched={mismatched}
        emptyMessage="まだ組み合わせがありません"
      />

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">プレビュー</h2>
        <DivisionBracket
          division={division}
          participants={participants}
          overallSeq={overallSeq}
        />
      </section>
    </div>
  );
}
