import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const findDivisionInTournament = vi.fn();
const deleteDivisionInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn();
const redirect = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("../repository", () => ({
  findDivisionInTournament: (
    organizationId: string,
    tournamentId: string,
    divisionId: string,
  ) => findDivisionInTournament(organizationId, tournamentId, divisionId),
}));

vi.mock("./repository", () => ({
  deleteDivisionInDb: (input: unknown) => deleteDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { deleteDivisionAction } = await import("./handler");

const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const division = {
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION" as const,
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (confirmName: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("confirmName", confirmName);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  findDivisionInTournament.mockReset();
  deleteDivisionInDb.mockReset();
  revalidatePath.mockReset();
  notFound.mockReset();
  redirect.mockReset();
  requireOrganization.mockResolvedValue({
    organization,
    permissionCodes: [...PERMISSION_CODES],
    ability: defineAbilityFor(PERMISSION_CODES),
  });
  findDivisionInTournament.mockResolvedValue(division);
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("deleteDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    deleteDivisionInDb.mockReturnValue(Effect.succeed({ deleted: 1 }));

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("名前が一致したら削除し、大会詳細へ戻す", async () => {
    deleteDivisionInDb.mockReturnValue(Effect.succeed({ deleted: 1 }));

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis-club/tournaments/t1");
  });

  // クライアント側の disabled は体感のためのもので、境界はここ。
  it("名前が一致しなければ削除しない", async () => {
    const state = await deleteDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("女子シングルス"),
    );

    expect(deleteDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("部門名が一致しません");
  });

  it("確認欄が空なら削除しない", async () => {
    const state = await deleteDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("   "),
    );

    expect(deleteDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("確認のため部門名を入力してください");
  });

  it("その組織のその大会に部門が無ければ 404 にする", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(deleteDivisionInDb).not.toHaveBeenCalled();
  });

  it("突き合わせ後に 0 件削除だった場合も 404 にする", async () => {
    deleteDivisionInDb.mockReturnValue(Effect.succeed({ deleted: 0 }));

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(redirect).not.toHaveBeenCalled();
  });
});
