import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_ORGANIZATION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const updateOrganizationInDb = vi.fn();
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
  updateOrganizationInDb: (input: unknown) => updateOrganizationInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { updateOrganizationAction } = await import("./handler");

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
  data.set("name", name);
  return data;
};

describe("updateOrganizationAction", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    updateOrganizationInDb.mockReset();
    revalidatePath.mockClear();
    notFound.mockClear();
    redirect.mockClear();
    requireOrganization.mockResolvedValue({
      session: { user: { id: "u1", name: "竹添" } },
      organization,
      role: "OWNER",
    });
  });

  it("所属していなければ requireOrganization の時点で打ち切られ、検証にも更新にも進まない", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      updateOrganizationAction(
        INITIAL_ORGANIZATION_FORM_STATE,
        buildFormData("卓球部"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(updateOrganizationInDb).not.toHaveBeenCalled();
  });

  it("スキーマ検証に失敗すれば更新せずエラーを返す", async () => {
    const result = await updateOrganizationAction(
      INITIAL_ORGANIZATION_FORM_STATE,
      buildFormData(""),
    );

    expect(result).toEqual({ error: "組織名を入力してください" });
    expect(updateOrganizationInDb).not.toHaveBeenCalled();
  });

  it("更新件数が 0 件なら、ページ表示後に組織が消えた競合とみなし notFound で打ち切る", async () => {
    updateOrganizationInDb.mockReturnValue(Effect.succeed({ updated: 0 }));

    await expect(
      updateOrganizationAction(
        INITIAL_ORGANIZATION_FORM_STATE,
        buildFormData("卓球部"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("更新件数が 1 件以上なら redirect する", async () => {
    updateOrganizationInDb.mockReturnValue(Effect.succeed({ updated: 1 }));

    // 成功時は redirect が例外として制御を奪うので、通常の return ではなく
    // 例外側で成功を確認する。
    await expect(
      updateOrganizationAction(
        INITIAL_ORGANIZATION_FORM_STATE,
        buildFormData("卓球部"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(updateOrganizationInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      name: "卓球部",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club");
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis-club");
  });
});
