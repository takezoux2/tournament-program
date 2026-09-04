import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";
import { INITIAL_TOURNAMENT_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const updateTournamentInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  // require-organization.test.ts と同じ形で模す。
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((_path: string) => {
  // next/navigation の redirect は例外を投げて制御を打ち切る。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  updateTournamentInDb: (input: unknown) => updateTournamentInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { updateTournamentAction } = await import("./handler");

// name と slug をあえて別物にしておく。比較に slug を取り違えて使う実装が
// 紛れ込んでいても、このテストなら見分けられる。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (name: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("name", name);
  data.set("startsAt", "");
  data.set("description", "");
  return data;
};

describe("updateTournamentAction", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    updateTournamentInDb.mockReset();
    revalidatePath.mockClear();
    notFound.mockClear();
    redirect.mockClear();
    requireOrganization.mockResolvedValue({
      session: { user: { id: "u1", name: "竹添" } },
      organization,
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
    });
  });

  it("所属していなければ requireOrganization の時点で打ち切られ、検証にも更新にも進まない", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      updateTournamentAction(
        INITIAL_TOURNAMENT_FORM_STATE,
        buildFormData("春季大会"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(updateTournamentInDb).not.toHaveBeenCalled();
  });

  it("スキーマ検証に失敗すれば更新せずエラーを返す", async () => {
    const result = await updateTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(""),
    );

    expect(result).toEqual({ error: "大会名を入力してください" });
    expect(updateTournamentInDb).not.toHaveBeenCalled();
  });

  it("更新件数が 0 件なら、この組織にその大会が無いとみなし notFound で打ち切る", async () => {
    updateTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));

    await expect(
      updateTournamentAction(
        INITIAL_TOURNAMENT_FORM_STATE,
        buildFormData("春季大会"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("更新件数が 1 件以上なら redirect する", async () => {
    updateTournamentInDb.mockReturnValue(Effect.succeed({ updated: 1 }));

    // 成功時は redirect が例外として制御を奪うので、通常の return ではなく
    // 例外側で成功を確認する。
    await expect(
      updateTournamentAction(
        INITIAL_TOURNAMENT_FORM_STATE,
        buildFormData("春季大会"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(updateTournamentInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      name: "春季大会",
      startsAt: null,
      description: "",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club");
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis-club/tournaments/t1");
  });
});
