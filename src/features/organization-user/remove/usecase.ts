import { Effect } from "effect";
import { LastGrantHolder, type OrganizationUserError } from "../errors";
import type { CountGrantHoldersPort, RemoveUserPort } from "./repository";
import type { RemoveUserInput } from "./schema";

export type RemoveUserPorts = {
  countGrantHolders: CountGrantHoldersPort;
  remove: RemoveUserPort;
};

/**
 * 削除の前に「対象が最後の user.grant 保持者か」を DB に問い合わせて確かめる。
 * フォームから来た値は信用できないため、判定材料はすべてクエリから取る。
 * 消してしまうと権限行を書ける人が誰もいなくなり、UI からは復旧できない。
 */
export const removeUser = (
  ports: RemoveUserPorts,
  input: RemoveUserInput,
  organizationId: string,
): Effect.Effect<{ removed: number }, OrganizationUserError> =>
  ports
    .countGrantHolders({ userId: input.userId, organizationId })
    .pipe(
      Effect.flatMap((holders) =>
        holders.targetHolds && holders.otherHolders === 0
          ? Effect.fail(new LastGrantHolder({ userId: input.userId }))
          : ports.remove({ ...input, organizationId }),
      ),
    );
