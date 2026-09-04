import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const addMemberInDb = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("./repository", () => ({
  addMemberInDb: (input: unknown) => addMemberInDb(input),
}));

const { addMemberAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

describe("addMemberAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    addMemberInDb.mockReset();
    revalidatePath.mockReset();
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis" },
    });
    // AddMemberPort は Effect を返す契約なので、素の Promise を返すモックだと
    // Effect.runPromiseExit が "Not a valid effect" で die してしまう。
    addMemberInDb.mockImplementation(() => Effect.void);
  });

  it("member.add を要求する", async () => {
    await addMemberAction(
      initial,
      formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
    );

    expect(requirePermission).toHaveBeenCalledWith("tennis", "member.add");
  });

  it("URL の slug ではなく organization.id で作る", async () => {
    await addMemberAction(
      initial,
      formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
    );

    expect(addMemberInDb).toHaveBeenCalledWith({
      name: "竹添",
      nameKana: "たけぞえ",
      organizationId: "o1",
    });
  });

  it("追加できたら一覧を再検証する", async () => {
    const state = await addMemberAction(
      initial,
      formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/members");
  });

  it("氏名が空ならバリデーションエラーを返し、DB を触らない", async () => {
    const state = await addMemberAction(
      initial,
      formData({ slug: "tennis", name: " ", nameKana: "たけぞえ" }),
    );

    expect(state.error).toBe("氏名を入力してください");
    expect(addMemberInDb).not.toHaveBeenCalled();
  });

  it("権限が無ければ requirePermission の時点で打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      addMemberAction(
        initial,
        formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(addMemberInDb).not.toHaveBeenCalled();
  });
});
