import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const updateDivisionInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn();
const redirect = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  updateDivisionInDb: (input: unknown) => updateDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { updateDivisionAction } = await import("./handler");

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
  data.set("divisionId", "d1");
  data.set("name", name);
  data.set("format", format);
  // resultConfig は checkbox 未設定（= 無効）のまま、スコア欄の数と集計方法だけ
  // 有効な値を入れておく。この 2 つは coerce/enum で必ず検証されるため、
  // 値が無いと resultConfig 側の失敗で name のエラーを隠してしまう。
  data.set("winReasonOptions", "");
  data.set("scoreCount", "3");
  data.set("scoreAggregation", "sum");
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  updateDivisionInDb.mockReset();
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

describe("updateDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    updateDivisionInDb.mockReturnValue(Effect.succeed({ updated: 1 }));

    await expect(
      updateDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("成功したら部門詳細へ戻し、一覧と詳細を再検証する", async () => {
    updateDivisionInDb.mockReturnValue(Effect.succeed({ updated: 1 }));

    await expect(
      updateDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1/divisions/d1",
    );
    expect(redirect).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1/divisions/d1",
    );
  });

  it("入力が不正なら DB を触らずエラー文言を返す", async () => {
    const state = await updateDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData(""),
    );

    expect(updateDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("部門名を入力してください");
  });

  it("0 件更新は 404 にし、部門の存在を漏らさない", async () => {
    updateDivisionInDb.mockReturnValue(Effect.succeed({ updated: 0 }));

    await expect(
      updateDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(redirect).not.toHaveBeenCalled();
  });

  it("失敗は文言に畳んで返し、遷移しない", async () => {
    const { UnexpectedDivisionError } = await import("../errors");
    updateDivisionInDb.mockReturnValue(
      Effect.fail(new UnexpectedDivisionError({ reason: new Error("boom") })),
    );

    const state = await updateDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("男子"),
    );

    expect(state.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
