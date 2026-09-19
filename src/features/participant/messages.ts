import { Match } from "effect";
import type { ParticipantError } from "./errors";

/**
 * Match.exhaustive により、ParticipantError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const participantErrorMessage: (error: ParticipantError) => string =
  Match.type<ParticipantError>().pipe(
    Match.tag(
      "ParticipantNotFoundError",
      () => "対象の参加者が見つかりません。画面を再読み込みしてください",
    ),
    Match.tag(
      "ParticipantDuplicateError",
      () => "その人はすでにこの大会の参加者です",
    ),
    Match.tag(
      "ParticipantMemberNotFoundError",
      () => "選択したメンバーが見つかりません",
    ),
    Match.tag(
      "ParticipantEnteredError",
      (error) =>
        `${error.divisionNames.join("、")} にエントリー中です。先に部門の編集画面から外してください`,
    ),
    Match.tag(
      "ParticipantDataError",
      () => "部門のデータが壊れているため削除できません",
    ),
    Match.tag(
      "UnexpectedParticipantError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
