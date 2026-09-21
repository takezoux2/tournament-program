import { Match } from "effect";
import type { DivisionError } from "./errors";

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
      () => "その参加者はすでにエントリーしています",
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
    Match.exhaustive,
  );
