import { Match } from "effect";
import type { ScheduleError } from "./errors";

/**
 * Match.exhaustive により、errors.ts にタグを足して文言を書き忘れると
 * コンパイルエラーになる。
 */
export const scheduleErrorMessage: (error: ScheduleError) => string =
  Match.type<ScheduleError>().pipe(
    Match.tag(
      "ScheduleStaleError",
      () => "一覧が更新されています。画面を再読み込みしてください",
    ),
    Match.tag(
      "ScheduleItemNotFoundError",
      () => "対象の区切りが見つかりません。画面を再読み込みしてください",
    ),
    Match.tag(
      "ScheduleDataError",
      () => "試合一覧のデータが壊れています。管理者に連絡してください",
    ),
    Match.tag(
      "ScheduleOrderConflictError",
      () => "並び順が競合しました。もう一度お試しください",
    ),
    Match.tag(
      "UnexpectedScheduleError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
