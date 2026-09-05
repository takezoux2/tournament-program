import { Cause, Option } from "effect";
import type { ScheduleError } from "./errors";
import { scheduleErrorMessage } from "./messages";
import type { ScheduleFormState } from "./state";

/**
 * Exit-failure → 日本語文言の変換。4 スライスが使うため、
 * スライスの外（カテゴリ直下）に置く。
 */
export const scheduleErrorFormState = (
  cause: Cause.Cause<ScheduleError>,
): ScheduleFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? scheduleErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
  };
};
