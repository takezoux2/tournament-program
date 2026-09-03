import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const addUserInDb = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("./repository", () => ({
  addUserInDb: (input: unknown) => addUserInDb(input),
}));

const { addUserAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

describe("addUserAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    addUserInDb.mockReset();
    revalidatePath.mockReset();
    requirePermission.mockResolvedValue({
      session: { user: { id: "me" } },
      organization: { id: "o1", slug: "tennis" },
      permissionCodes: ["user.view", "user.add", "user.grant"],
    });
    // AddUserPort は Effect を返す契約なので、素の Promise を返すモックだと
    // Effect.runPromiseExit が die してしまう。
    addUserInDb.mockImplementation(() => Effect.succeed(undefined));
  });

  it("user.add を要求する", async () => {
    await addUserAction(initial, formData({ slug: "tennis", userId: "u1" }));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.add");
  });

  it("追加者の権限コードをそのまま repository に渡す", async () => {
    await addUserAction(initial, formData({ slug: "tennis", userId: "u1" }));

    expect(addUserInDb).toHaveBeenCalledWith({
      userId: "u1",
      organizationId: "o1",
      granterCodes: ["user.view", "user.add", "user.grant"],
    });
  });

  it("権限の少ない追加者からは、少ない権限しか渡らない", async () => {
    // フォームではなく requirePermission の実測値を使うので、
    // 自分より強いメンバーは作れない。
    requirePermission.mockResolvedValue({
      session: { user: { id: "me" } },
      organization: { id: "o1", slug: "tennis" },
      permissionCodes: ["user.view", "user.add"],
    });

    await addUserAction(initial, formData({ slug: "tennis", userId: "u1" }));

    expect(addUserInDb).toHaveBeenCalledWith(
      expect.objectContaining({ granterCodes: ["user.view", "user.add"] }),
    );
  });

  it("追加できたら一覧を再検証する", async () => {
    const state = await addUserAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/users");
  });

  it("権限が無ければ requirePermission の時点で打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      addUserAction(initial, formData({ slug: "tennis", userId: "u1" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(addUserInDb).not.toHaveBeenCalled();
  });
});
