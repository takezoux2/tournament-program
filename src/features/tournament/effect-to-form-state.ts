import { Cause, Option } from "effect";
import type { TournamentError } from "./errors";
import { tournamentErrorMessage } from "./messages";
import type { TournamentFormState } from "./state";

/**
 * create スライスが使う Exit-failure → 日本語文言の変換。今後 update スライスからも
 * 同様に使う想定だが、スライス同士は依存できないため、共有先として features/tournament
 * 直下に置く。
 */
export const tournamentErrorFormState = (
  cause: Cause.Cause<TournamentError>,
): TournamentFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? tournamentErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
  };
};
