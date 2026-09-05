"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { scheduleErrorFormState } from "../effect-to-form-state";
import { revalidateSchedule } from "../revalidate";
import type { ScheduleFormState } from "../state";
import { removeDividerInDb } from "./repository";
import { removeDividerSchema } from "./schema";
import { removeDivider } from "./usecase";

export const removeDividerAction = async (
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = removeDividerSchema.safeParse({
    itemId: String(formData.get("itemId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeDivider(
      removeDividerInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return scheduleErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateSchedule(slug, tournamentId);
  return { error: null };
};
