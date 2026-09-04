import { Match } from "effect";
import type { MemberError } from "./errors";

/**
 * Match.exhaustive により、MemberError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const memberErrorMessage: (error: MemberError) => string =
  Match.type<MemberError>().pipe(
    Match.tag("MemberNotFound", () => "該当するメンバーが見つかりません"),
    Match.tag(
      "MemberHasParticipants",
      () => "大会への参加記録があるため削除できません",
    ),
    Match.tag(
      "UnexpectedMemberError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
