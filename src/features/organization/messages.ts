import { Match } from "effect";
import { MAX_SLUG_LENGTH, MIN_SLUG_LENGTH, type SlugViolation } from "./domain";
import type { OrganizationError } from "./errors";

/**
 * Match.exhaustive により、OrganizationError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const organizationErrorMessage: (error: OrganizationError) => string =
  Match.type<OrganizationError>().pipe(
    Match.tag("SlugTaken", () => "この組織 ID は既に使われています"),
    Match.tag(
      "UnexpectedOrganizationError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );

/**
 * Record のキーを SlugViolation に固定しているため、違反の種類を足して
 * 文言を書き忘れるとコンパイルエラーになる。
 */
const SLUG_VIOLATION_MESSAGES: Record<SlugViolation, string> = {
  empty: "組織 ID を入力してください",
  tooShort: `組織 ID は${MIN_SLUG_LENGTH}文字以上で入力してください`,
  tooLong: `組織 ID は${MAX_SLUG_LENGTH}文字以内で入力してください`,
  invalidCharacter: "組織 ID は半角英小文字・数字・ハイフンのみ使えます",
  hyphenEdge: "組織 ID の先頭と末尾にハイフンは使えません",
  consecutiveHyphen: "組織 ID にハイフンを連続して使うことはできません",
  reserved: "この組織 ID は予約されているため使えません",
};

export const slugViolationMessage = (violation: SlugViolation): string =>
  SLUG_VIOLATION_MESSAGES[violation];
