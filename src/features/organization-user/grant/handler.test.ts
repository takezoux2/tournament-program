import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor } from "@/shared/authz/ability";

const requirePermission = vi.fn();
const grantPermissionsInDb = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
  notFound: () => notFound(),
}));

vi.mock("./repository", () => ({
  grantPermissionsInDb: (input: unknown) => grantPermissionsInDb(input),
}));

const { grantPermissionsAction } = await import("./handler");

/** codes は同名で複数入るため、FormData を直接組み立てる。 */
const formData = (
  fields: { slug: string; userId: string },
  codes: string[],
) => {
  const data = new FormData();
  data.set("slug", fields.slug);
  data.set("userId", fields.userId);
  for (const code of codes) {
    data.append("permissionCode", code);
  }
  return data;
};

const initial = { error: null };

/** requirePermission の戻り。ability は保有コードから組み立てる。 */
const context = (permissionCodes: string[]) => ({
  session: { user: { id: "me" } },
  organization: { id: "o1", slug: "tennis" },
  permissionCodes,
  ability: defineAbilityFor(permissionCodes),
});

describe("grantPermissionsAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    grantPermissionsInDb.mockReset();
    revalidatePath.mockReset();
    redirect.mockClear();
    notFound.mockClear();
    requirePermission.mockResolvedValue(context(["user.view", "user.grant"]));
    // GrantPermissionsPort は Effect を返す契約なので、素の Promise を返すモックだと
    // Effect.runPromiseExit が "Not a valid effect" で die してしまう。
    grantPermissionsInDb.mockImplementation(() =>
      Effect.succeed({ updated: 1 }),
    );
  });

  it("user.grant を要求する", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["user.view"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.grant");
  });

  it("チェックされた権限コードだけを渡す", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["user.view", "org.edit"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(grantPermissionsInDb).toHaveBeenCalledWith({
      userId: "u1",
      organizationId: "o1",
      codes: ["user.view", "org.edit"],
    });
  });

  it("自分自身から user.grant を外そうとしたら拒否し、DB を触らない", async () => {
    // 最後の user.grant 保持者が自分を降格すると、誰も権限を戻せなくなる。
    const state = await grantPermissionsAction(
      initial,
      formData({ slug: "tennis", userId: "me" }, ["user.view"]),
    );

    expect(state.error).toBe(
      "自分自身からは「ユーザーの閲覧」と「権限の付与・剥奪」の権限を外せません",
    );
    expect(grantPermissionsInDb).not.toHaveBeenCalled();
  });

  it("自分自身から user.view を外そうとしたら拒否し、DB を触らない", async () => {
    // 保存後のリダイレクト先 /orgs/[slug]/users が user.view を要求するため、
    // 外せてしまうと自分で自分を 404 に閉じ込める。
    const state = await grantPermissionsAction(
      initial,
      formData({ slug: "tennis", userId: "me" }, ["user.grant"]),
    );

    expect(state.error).toBe(
      "自分自身からは「ユーザーの閲覧」と「権限の付与・剥奪」の権限を外せません",
    );
    expect(grantPermissionsInDb).not.toHaveBeenCalled();
  });

  it("自分自身でもロック対象を残していれば保存できる", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "me" }, [
          "user.grant",
          "user.view",
          "org.edit",
        ]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(grantPermissionsInDb).toHaveBeenCalled();
  });

  it("他人からは user.view を外せる", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["org.edit"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(grantPermissionsInDb).toHaveBeenCalled();
  });

  it("元々 user.view を持っていない自分なら、外れたままでも保存できる", async () => {
    // 持っていない権限を「外すな」と言われても保存できない。
    requirePermission.mockResolvedValue(context(["user.grant"]));

    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "me" }, ["user.grant"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(grantPermissionsInDb).toHaveBeenCalled();
  });

  it("user.view を持っていれば、保存後は一覧へ戻す", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["user.view"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/users");
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis/users");
  });

  it("user.view を持っていなければ、保存後は組織トップへ戻す", async () => {
    // 一覧は user.view を要求するため、そのまま送ると保存は成功したのに
    // 404 に落とすことになる。user.add した人が user.view を持たないことは
    // 起こりうる（新しいメンバーは追加者の権限だけを引き継ぐ）。
    requirePermission.mockResolvedValue(context(["user.grant"]));

    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["user.view"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/orgs/tennis");
  });

  it("未知の権限コードが混ざっていたらエラーを返し、DB を触らない", async () => {
    const state = await grantPermissionsAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }, ["system.root"]),
    );

    expect(state.error).not.toBeNull();
    expect(grantPermissionsInDb).not.toHaveBeenCalled();
  });
});
