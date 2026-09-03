import { Cause, Option } from "effect";
import type { OrganizationUserError } from "./errors";
import { organizationUserErrorMessage } from "./messages";
import type { OrganizationUserFormState, UserSearchState } from "./state";

const FALLBACK_MESSAGE = "処理に失敗しました。時間をおいて再度お試しください";

/**
 * 4 つのスライスがそれぞれ同じ変換を持つのを避けるため、
 * 共有先として features/organization-user 直下に置く。
 */
const causeMessage = (cause: Cause.Cause<OrganizationUserError>): string => {
  const failure = Cause.failureOption(cause);
  return Option.isSome(failure)
    ? organizationUserErrorMessage(failure.value)
    : FALLBACK_MESSAGE;
};

export const organizationUserErrorFormState = (
  cause: Cause.Cause<OrganizationUserError>,
): OrganizationUserFormState => ({ error: causeMessage(cause) });

export const organizationUserErrorSearchState = (
  cause: Cause.Cause<OrganizationUserError>,
): UserSearchState => ({ error: causeMessage(cause), user: null });
