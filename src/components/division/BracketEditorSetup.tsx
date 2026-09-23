import { minEntries } from "@/features/division/matching-strategy";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isSingleEliminationShape } from "@/features/division/single-elimination/build";
import { firstRoundPairs } from "@/features/division/single-elimination/first-round";
import type { SlotSourceOption } from "@/features/division/slot-source-options";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import { AddFirstRoundMatchButton } from "./AddFirstRoundMatchButton";
import { DivisionBracket } from "./DivisionBracket";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { LockedNotice } from "./LockedNotice";
import { MatchNameSection } from "./MatchNameSection";
import { Notice } from "./Notice";
import { parseSetupData } from "./parse-setup-data";

export type BracketEditorSetupActions = {
  addFirstRoundMatch: DivisionFormAction;
  removeFirstRoundMatch: DivisionFormAction;
  assignSlot: DivisionFormAction;
  clearSlot: DivisionFormAction;
  generateMatching: DivisionFormAction;
  setMatchName: DivisionFormAction;
};

/**
 * シングルエリミネーションの setup 画面。プレビューがそのまま編集画面で、
 * 試合の追加と 1 回戦のスロット編集をブラケット上で行う。
 * ダブルエリミは勝者側 1 回戦だけを直接いじると敗者側の対応が崩れるため、
 * 従来の DivisionSetup のまま。
 */
export function BracketEditorSetup({
  division,
  participants,
  members,
  slug,
  tournamentId,
  overallSeq,
  actions,
  entryLabels,
  sourceOptions,
  warnings = [],
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  members: MemberSummary[];
  slug: string;
  tournamentId: string;
  /** 大会全体の通し番号。{{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  actions: BracketEditorSetupActions;
  /** 参照エントリーの表示名（entryId → 名前）。呼び出し側が entry-source から作る */
  entryLabels?: ReadonlyMap<string, string>;
  /** 参照できる他部門。ページが buildSlotSourceOptions で作って渡す */
  sourceOptions: SlotSourceOption[];
  /**
   * 参照エントリーについての注意書き（同順位・循環・参照切れ・重複）。
   * 保存は止めない方針なので、気づけるようここに出す。
   */
  warnings?: string[];
}) {
  const parsed = parseSetupData(division);
  if (parsed === null) {
    return <Notice>部門のデータを読み込めませんでした</Notice>;
  }

  // 勝敗が入ったあとに組み合わせを変えると結果の参照が壊れる。
  // サーバ側でも拒否するが、押せてしまう前に理由を見せる。
  const locked = parsed.results.matches.length > 0;

  // /edit で format を書き換えた部門は league の星取表を持っていることがある。
  // また、旧画面でエントリーだけ登録して生成していない部門もある。
  // どちらも生成し直せば編集できる形になる。ただし生成できる人数に
  // 満たないエントリーしか無いと生成は失敗するので、そのときは
  // エディタを出して「試合を追加」から組めるようにする。
  const mismatched = !isSingleEliminationShape(parsed.matchingConfig);
  const needsGeneration =
    mismatched ||
    (parsed.matchingConfig.matches.length === 0 &&
      parsed.entries.entries.length >= minEntries("SINGLE_ELIMINATION"));

  // 候補から外すのは 1 回戦のスロットに置かれているエントリーの人だけ。
  // スロットに置かれていないエントリー（試合の削除で外れたものや旧画面で
  // 登録したもの）の人は、割り当て時にそのエントリーを使い回す。
  const placedEntryIds = new Set(
    firstRoundPairs(parsed.matchingConfig).flatMap((pair) =>
      pair.flatMap((slot) => (slot.kind === "entry" ? [slot.entryId] : [])),
    ),
  );
  const placedParticipantIds = new Set(
    parsed.entries.entries
      .filter((entry) => placedEntryIds.has(entry.id))
      .flatMap((entry) =>
        // 参照エントリーは Member を持たないので候補の絞り込みには効かない
        entry.participantId === undefined ? [] : [entry.participantId],
      ),
  );
  const placedMemberIds = new Set(
    participants
      .filter((participant) => placedParticipantIds.has(participant.id))
      .flatMap((participant) =>
        participant.memberId === undefined ? [] : [participant.memberId],
      ),
  );
  const availableMembers = members.filter(
    (member) => !placedMemberIds.has(member.id),
  );

  return (
    <div className="space-y-6">
      {locked && <LockedNotice />}
      {warnings.map((warning) => (
        <Notice key={warning}>{warning}</Notice>
      ))}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">プレビュー</h2>
        {needsGeneration ? (
          <>
            <GenerateMatchingForm
              slug={slug}
              tournamentId={tournamentId}
              divisionId={division.id}
              action={actions.generateMatching}
              disabled={locked}
              label="組み合わせを生成"
            />
            <Notice>
              {mismatched
                ? "この組み合わせはトーナメントの形ではありません。作り直してください"
                : "登録済みのエントリーから組み合わせを生成してください"}
            </Notice>
          </>
        ) : (
          <>
            <AddFirstRoundMatchButton
              action={actions.addFirstRoundMatch}
              slug={slug}
              tournamentId={tournamentId}
              divisionId={division.id}
              disabled={locked}
            />
            <DivisionBracket
              division={division}
              participants={participants}
              overallSeq={overallSeq}
              entryLabels={entryLabels}
              editor={{
                locked,
                slug,
                tournamentId,
                divisionId: division.id,
                members: availableMembers,
                actions: {
                  assignSlot: actions.assignSlot,
                  clearSlot: actions.clearSlot,
                  removeMatch: actions.removeFirstRoundMatch,
                },
                sourceOptions,
              }}
            />
          </>
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
        emptyMessage={
          needsGeneration
            ? "まだ組み合わせがありません"
            : "「試合を追加」で 1 回戦の試合を作ります"
        }
        entryLabels={entryLabels}
      />
    </div>
  );
}
