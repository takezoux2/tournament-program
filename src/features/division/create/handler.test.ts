import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const createDivisionInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  createDivisionInDb: (input: unknown) => createDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { createDivisionAction } = await import("./handler");

// name と slug をあえて別物にしておく。取り違えた実装を見分けるため。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (
  name: string,
  format = "SINGLE_ELIMINATION",
): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("name", name);
  data.set("format", format);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  createDivisionInDb.mockReset();
  revalidatePath.mockReset();
  notFound.mockReset();
  redirect.mockReset();
  requireOrganization.mockResolvedValue({
    organization,
    session: { user: { id: "u1" } },
    permissionCodes: [...PERMISSION_CODES],
    ability: defineAbilityFor(PERMISSION_CODES),
  });
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("createDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    createDivisionInDb.mockReturnValue(Effect.succeed({ id: "d1" }));

    await expect(
      createDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("成功したら部門詳細へ送り、大会ページを再検証する", async () => {
    createDivisionInDb.mockReturnValue(Effect.succeed({ id: "d1" }));

    await expect(
      createDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(redirect).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1/divisions/d1?created=division",
    );
  });

  it("入力が不正なら DB を触らずエラー文言を返す", async () => {
    const state = await createDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("   "),
    );

    expect(createDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("部門名を入力してください");
  });

  it("形式が不正なら DB を触らずエラー文言を返す", async () => {
    const state = await createDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("男子", "SWISS"),
    );

    expect(createDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("試合形式を選択してください");
  });

  it("その組織に大会が無ければ 404 にし、存在を漏らさない", async () => {
    createDivisionInDb.mockReturnValue(Effect.succeed(null));

    await expect(
      createDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(redirect).not.toHaveBeenCalled();
  });

  it("採番が競合したら文言を返し、遷移しない", async () => {
    const { DivisionOrderConflictError } = await import("../errors");
    createDivisionInDb.mockReturnValue(
      Effect.fail(new DivisionOrderConflictError({ tournamentId: "t1" })),
    );

    const state = await createDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("男子"),
    );

    expect(state.error).toBe("並び順が競合しました。もう一度お試しください");
    expect(redirect).not.toHaveBeenCalled();
  });
});
