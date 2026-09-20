import { Cause, Option } from "effect";
import type { ParticipantError } from "./errors";
import { participantErrorMessage } from "./messages";
import type { ParticipantFormState } from "./state";

const FALLBACK_MESSAGE = "処理に失敗しました。時間をおいて再度お試しください";

/** add / remove / set-player-number が同じ変換を持つのを避けるため直下に置く。 */
export const participantErrorFormState = (
  cause: Cause.Cause<ParticipantError>,
): ParticipantFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? participantErrorMessage(failure.value)
      : FALLBACK_MESSAGE,
  };
};
