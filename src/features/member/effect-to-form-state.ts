import { Cause, Option } from "effect";
import type { MemberError } from "./errors";
import { memberErrorMessage } from "./messages";
import type { MemberFormState } from "./state";

const FALLBACK_MESSAGE = "処理に失敗しました。時間をおいて再度お試しください";

/** add / remove の両スライスが同じ変換を持つのを避けるため、共有先として直下に置く。 */
export const memberErrorFormState = (
  cause: Cause.Cause<MemberError>,
): MemberFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? memberErrorMessage(failure.value)
      : FALLBACK_MESSAGE,
  };
};
