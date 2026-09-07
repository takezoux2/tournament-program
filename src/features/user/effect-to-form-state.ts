import { Cause, Option } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { profileErrorMessage } from "./messages";
import type { ProfileFormState } from "./state";

/**
 * 全スライスの handler が同じ変換を持つことになるため、共有先として
 * features/user 直下に置く。features/organization の同名ファイルと同じ役割。
 */
export const profileErrorFormState = (
  cause: Cause.Cause<AuthError>,
): ProfileFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? profileErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
    notice: null,
  };
};
