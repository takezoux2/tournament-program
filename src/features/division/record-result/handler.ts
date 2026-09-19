"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionResults } from "../revalidate";
import type { DivisionFormState } from "../state";
import { recordResultInDb } from "./repository";
import { recordResultSchema } from "./schema";
import { recordResultForDivision } from "./usecase";

export const recordResultAction = async (
  prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization, session } = await requireOrganization(slug);

  const parsed = recordResultSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    winnerEntryId: String(formData.get("winnerEntryId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await runOperationExit(
    "division.record-result",
    {
      request: parsed.data,
      context: {
        userId: session.user.id,
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    recordResultForDivision(
      recordResultInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionResults(slug, tournamentId, divisionId);
  // 何も書いていないので増やさない。ただし値は持ち越す。undefined に
  // 落とすとクライアント側のカウンタだけが 0 に戻り、次に本当に記録した
  // ときの 1 が「前回発火した 3」を超えられず、イベントが黙って消える。
  if (!exit.value.value.recorded) {
    return { error: null, succeeded: prevState.succeeded };
  }
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
};
