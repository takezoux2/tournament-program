import { Cause, Option } from "effect";
import type { OrganizationError } from "./errors";
import { organizationErrorMessage } from "./messages";
import type { OrganizationFormState } from "./state";

/**
 * create・update・delete の 3 スライスがそれぞれ同じ変換を持っていたが、
 * スライス同士は依存できないため、共有先として features/organization 直下に置く。
 */
export const organizationErrorFormState = (
  cause: Cause.Cause<OrganizationError>,
): OrganizationFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? organizationErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
  };
};
