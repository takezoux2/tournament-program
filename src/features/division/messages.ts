import { Match } from "effect";
import type { DivisionEntrySourceInvalidError, DivisionError } from "./errors";

/** 参照先が使えない理由ごとの文言。 */
const ENTRY_SOURCE_INVALID_MESSAGES: Record<
  DivisionEntrySourceInvalidError["reason"],
  string
> = {
  notFound: "参照先の部門が見つかりません",
  sameDivision: "同じ部門の結果は参照できません",
  notLeague: "順位を参照できるのはリーグの部門だけです",
  matchNotFound: "参照先の試合が見つかりません。画面を再読み込みしてください",
};

/**
 * Match.exhaustive により、errors.ts にタグを足して文言を書き忘れると
 * コンパイルエラーになる。
 */
export const divisionErrorMessage: (error: DivisionError) => string =
  Match.type<DivisionError>().pipe(
    Match.tag(
      "DivisionOrderConflictError",
      () => "並び順が競合しました。もう一度お試しください",
    ),
    Match.tag(
      "UnexpectedDivisionError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.tag(
      "DivisionResultsRecordedError",
      () => "勝敗が記録されているため、エントリーと組み合わせは変更できません",
    ),
    Match.tag(
      "DivisionNotEnoughEntriesError",
      (error) =>
        `組み合わせを作るにはエントリーが${error.minimum}人以上必要です`,
    ),
    Match.tag(
      "DivisionDataError",
      () => "部門のデータが壊れています。管理者に連絡してください",
    ),
    Match.tag(
      "DivisionEntryLimitError",
      (error) => `エントリーは${error.limit}人までです`,
    ),
    Match.tag(
      "DivisionDuplicateEntryError",
      // 参照エントリー（他部門の勝者/敗者・順位）の二重登録でも使われるため、
      // 「参加者」に限定しない言い方にする。
      () => "すでに同じエントリーが登録されています",
    ),
    Match.tag(
      "DivisionMemberNotFoundError",
      () => "選択したメンバーが見つかりません",
    ),
    Match.tag(
      "DivisionMatchNotFoundError",
      () => "対象の試合が見つかりません。画面を再読み込みしてください",
    ),
    Match.tag(
      "DivisionRevisionConflictError",
      () => "他の人が更新しました。画面を再読み込みしてください",
    ),
    Match.tag(
      "DivisionSlotNotDecidedError",
      () => "対戦相手がまだ決まっていません。画面を再読み込みしてください",
    ),
    Match.tag(
      "DivisionResultNotRecordedError",
      () => "先に勝敗を記録してください",
    ),
    Match.tag(
      "DivisionWinReasonNotAllowedError",
      () => "その勝因は選べません。画面を再読み込みしてください",
    ),
    Match.tag(
      "DivisionFirstRoundLimitError",
      (error) => `1回戦は${error.limit}試合までです`,
    ),
    Match.tag(
      "DivisionShapeMismatchError",
      () => "この組み合わせはトーナメントの形ではありません。作り直してください",
    ),
    Match.tag(
      "DivisionEntrySourceInvalidError",
      (error) => ENTRY_SOURCE_INVALID_MESSAGES[error.reason],
    ),
    Match.exhaustive,
  );
