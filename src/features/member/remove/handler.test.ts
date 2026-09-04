import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const removeMemberInDb = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("./repository", () => ({
  removeMemberInDb: (input: unknown) => removeMemberInDb(input),
}));

const { removeMemberAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

describe("removeMemberAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    removeMemberInDb.mockReset();
    revalidatePath.mockReset();
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis" },
    });
    removeMemberInDb.mockImplementation(() => Effect.succeed({ removed: 1 }));
  });

  it("member.remove を要求する", async () => {
    await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(requirePermission).toHaveBeenCalledWith("tennis", "member.remove");
  });

  it("URL の slug ではなく organization.id で絞って消す", async () => {
    await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(removeMemberInDb).toHaveBeenCalledWith({
      memberId: "m1",
      organizationId: "o1",
    });
  });

  it("削除できたら一覧を再検証する", async () => {
    const state = await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/members");
  });

  it("0 件（表示後に消えた・他組織の ID）は不在エラーを返す", async () => {
    removeMemberInDb.mockImplementation(() => Effect.succeed({ removed: 0 }));

    const state = await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(state.error).toBe("該当するメンバーが見つかりません");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("参加記録ありは文言にして返す", async () => {
    const { MemberHasParticipants } = await import("../errors");
    removeMemberInDb.mockImplementation(() =>
      Effect.fail(new MemberHasParticipants({ memberId: "m1" })),
    );

    const state = await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(state.error).toBe("大会への参加記録があるため削除できません");
  });

  it("権限が無ければ requirePermission の時点で打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      removeMemberAction(initial, formData({ slug: "tennis", memberId: "m1" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(removeMemberInDb).not.toHaveBeenCalled();
  });
});
