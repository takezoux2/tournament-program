import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { AddUserPort } from "./repository";
import type { AddUserInput } from "./schema";

export const addUser = (
  port: AddUserPort,
  input: AddUserInput,
  organizationId: string,
): Effect.Effect<void, OrganizationUserError> =>
  port({ ...input, organizationId });
