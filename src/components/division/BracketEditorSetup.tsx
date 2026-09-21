import { toMatchOrderView } from "@/features/division/match-name-view";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isSingleEliminationShape } from "@/features/division/single-elimination/build";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { AddFirstRoundMatchButton } from "./AddFirstRoundMatchButton";
import { DivisionBracket } from "./DivisionBracket";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { MatchOrderList } from "./MatchOrderList";
import { Notice } from "./Notice";

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
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  members: MemberSummary[];
  slug: string;
  tournamentId: string;
  /** 大会全体の通し番号。{{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  actions: BracketEditorSetupActions;
}) {
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

  // /edit で format を書き換えた部門は league の星取表を持っていることがある。
  // また、旧画面でエントリーだけ登録して生成していない部門もある。
  // どちらも生成し直せば編集できる形になる。
  const mismatched = !isSingleEliminationShape(parsed.matchingConfig);
  const needsGeneration =
    mismatched ||
    (parsed.matchingConfig.matches.length === 0 &&
      parsed.entries.entries.length > 0);

  const placedParticipantIds = new Set(
    parsed.entries.entries.map((entry) => entry.participantId),
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
      {locked && (
        <output className="block rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          勝敗が記録されているため、エントリーと組み合わせは変更できません
        </output>
      )}

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
              }}
            />
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">試合名</h2>
        {/* 試合名の変更は構造を変えないため、locked でも編集できる */}
        {mismatched ? (
          <Notice>組み合わせを作り直すと、ここに試合が出ます</Notice>
        ) : (
          <MatchOrderList
            rows={toMatchOrderView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
              division.format,
              resolveMatchNames(parsed.matchingConfig, division.id, overallSeq),
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            setMatchNameAction={actions.setMatchName}
            emptyMessage="「試合を追加」で 1 回戦の試合を作ります"
          />
        )}
      </section>
    </div>
  );
}
