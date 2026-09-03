import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const removeUserInDb = vi.fn();
const countGrantHoldersInDb = vi.fn();
const revalidatePath = vi.fn();
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
  notFound: () => notFound(),
}));

vi.mock("./repository", () => ({
  removeUserInDb: (input: unknown) => removeUserInDb(input),
  countGrantHoldersInDb: (input: unknown) => countGrantHoldersInDb(input),
}));

const { removeUserAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

describe("removeUserAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    removeUserInDb.mockReset();
    countGrantHoldersInDb.mockReset();
    countGrantHoldersInDb.mockImplementation(() =>
      Effect.succeed({ targetHolds: false, otherHolders: 1 }),
    );
    revalidatePath.mockReset();
    notFound.mockClear();
    requirePermission.mockResolvedValue({
      session: { user: { id: "me" } },
      organization: { id: "o1", slug: "tennis" },
    });
    // RemoveUserPort は Effect を返す契約なので、素の Promise を返すモックだと
    // Effect.runPromiseExit が "Not a valid effect" で die してしまう。
    removeUserInDb.mockImplementation(() => Effect.succeed({ removed: 1 }));
  });

  it("user.remove を要求する", async () => {
    await removeUserAction(initial, formData({ slug: "tennis", userId: "u1" }));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.remove");
  });

  it("自分自身を削除しようとしたら拒否し、DB を触らない", async () => {
    // ボタンを隠すのは体感のためで、境界はここ。Server Action は直接叩ける。
    const state = await removeUserAction(
      initial,
      formData({ slug: "tennis", userId: "me" }),
    );

    expect(state.error).toBe("自分自身をこの組織から削除することはできません");
    expect(removeUserInDb).not.toHaveBeenCalled();
  });

  it("削除できたら一覧を再検証する", async () => {
    const state = await removeUserAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/users");
  });

  it("最後の user.grant 保持者は削除できず、DB の削除まで進まない", async () => {
    // フォームの値ではなく DB の実測で判断する。ここを抜けると誰も
    // 権限行を書けなくなり、組織が UI から復旧できなくなる。
    countGrantHoldersInDb.mockImplementation(() =>
      Effect.succeed({ targetHolds: true, otherHolders: 0 }),
    );

    const state = await removeUserAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }),
    );

    expect(state.error).toBe("権限を付与できる最後のユーザーは削除できません");
    expect(removeUserInDb).not.toHaveBeenCalled();
  });

  it("他に user.grant 保持者が居れば削除できる", async () => {
    countGrantHoldersInDb.mockImplementation(() =>
      Effect.succeed({ targetHolds: true, otherHolders: 1 }),
    );

    const state = await removeUserAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }),
    );

    expect(state).toEqual({ error: null });
    expect(removeUserInDb).toHaveBeenCalledTimes(1);
  });

  it("user.grant を持たない相手には保護が働かない", async () => {
    countGrantHoldersInDb.mockImplementation(() =>
      Effect.succeed({ targetHolds: false, otherHolders: 0 }),
    );

    const state = await removeUserAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }),
    );

    expect(state).toEqual({ error: null });
    expect(removeUserInDb).toHaveBeenCalledTimes(1);
  });

  it("0 件なら notFound を呼ぶ（表示後に所属が消えていた場合）", async () => {
    removeUserInDb.mockImplementation(() => Effect.succeed({ removed: 0 }));

    await expect(
      removeUserAction(initial, formData({ slug: "tennis", userId: "u1" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("権限が無ければ requirePermission の時点で打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      removeUserAction(initial, formData({ slug: "tennis", userId: "u1" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(removeUserInDb).not.toHaveBeenCalled();
  });
});
