import { Cause, Option } from "effect";
import type { DivisionError } from "./errors";
import { divisionErrorMessage } from "./messages";
import type { DivisionFormState } from "./state";

/**
 * Exit-failure → 日本語文言の変換。create / update / delete / reorder の
 * 4 スライスが使うため、スライスの外（カテゴリ直下）に置く。
 */
export const divisionErrorFormState = (
  cause: Cause.Cause<DivisionError>,
): DivisionFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? divisionErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
  };
};
