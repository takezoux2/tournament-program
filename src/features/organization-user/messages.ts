import { Match } from "effect";
import type { OrganizationUserError } from "./errors";

/**
 * Match.exhaustive により、OrganizationUserError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const organizationUserErrorMessage: (
  error: OrganizationUserError,
) => string = Match.type<OrganizationUserError>().pipe(
  Match.tag("UserNotFound", () => "該当するユーザーが見つかりません"),
  Match.tag(
    "AlreadyMember",
    () => "このユーザーは既にこの組織に所属しています",
  ),
  Match.tag("NotAMember", () => "このユーザーはこの組織に所属していません"),
  Match.tag(
    "UnexpectedOrganizationUserError",
    () => "処理に失敗しました。時間をおいて再度お試しください",
  ),
  Match.exhaustive,
);
