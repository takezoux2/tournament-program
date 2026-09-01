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
    Match.exhaustive,
  );
