import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";
import { INITIAL_ORGANIZATION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const deleteOrganizationInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  // require-organization.test.ts と同じ形で模す。
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((_path: string) => {
  // next/navigation の redirect は例外を投げて制御を打ち切る。
  // require-organization.test.ts の notFound と同じ形で模す。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  deleteOrganizationInDb: (input: unknown) => deleteOrganizationInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { deleteOrganizationAction } = await import("./handler");

// name と slug をあえて別物にしておく。比較に slug を取り違えて使う実装が
// 紛れ込んでいても、このテストなら見分けられる。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (confirmName: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("confirmName", confirmName);
  return data;
};

describe("deleteOrganizationAction", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    deleteOrganizationInDb.mockReset();
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

  it("組織名が一致しなければ削除せずエラーを返す", async () => {
    // "tennis-club" は組織の slug であって name ではない。
    // name と slug を取り違えていればここが誤って通ってしまう。
    const result = await deleteOrganizationAction(
      INITIAL_ORGANIZATION_FORM_STATE,
      buildFormData("tennis-club"),
    );

    expect(result).toEqual({ error: "組織名が一致しません" });
    expect(deleteOrganizationInDb).not.toHaveBeenCalled();
  });

  it("組織名が一致すれば削除処理へ進む", async () => {
    deleteOrganizationInDb.mockReturnValue(Effect.succeed({ deleted: 1 }));

    // 成功時は redirect が例外として制御を奪うので、通常の return ではなく
    // 例外側で成功を確認する。
    await expect(
      deleteOrganizationAction(
        INITIAL_ORGANIZATION_FORM_STATE,
        buildFormData("テニス部"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteOrganizationInDb).toHaveBeenCalledWith({
      organizationId: "o1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("削除件数が 0 件なら、確認フォーム表示後に組織が消えた競合とみなし notFound で打ち切る", async () => {
    // 確認フォーム表示と deleteMany の間に組織が消えるレースを模す。
    // deleteMany 自体は成功として返るが件数は 0。
    deleteOrganizationInDb.mockReturnValue(Effect.succeed({ deleted: 0 }));

    await expect(
      deleteOrganizationAction(
        INITIAL_ORGANIZATION_FORM_STATE,
        buildFormData("テニス部"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("所属していなければ requireOrganization の時点で打ち切られ、比較にもリポジトリにも進まない", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      deleteOrganizationAction(
        INITIAL_ORGANIZATION_FORM_STATE,
        buildFormData("テニス部"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(deleteOrganizationInDb).not.toHaveBeenCalled();
  });
});
