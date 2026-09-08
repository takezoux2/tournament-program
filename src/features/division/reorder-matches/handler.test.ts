import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const reorderMatchesInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

// 関数呼び出しの順序を追跡するための配列
let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  reorderMatchesInDb: (ids: unknown, input: unknown) => {
    calls.push("reorderMatchesInDb");
    return reorderMatchesInDb(ids, input);
  },
}));

const { reorderMatchesAction } = await import("./handler");

const formData = (matchIds: string[]) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  for (const matchId of matchIds) {
    data.append("matchId", matchId);
  }
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  reorderMatchesInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  reorderMatchesInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("reorderMatchesAction", () => {
  it("並びを渡して保存し、画面を再検証する", async () => {
    const state = await reorderMatchesAction(
      { error: null },
      formData(["m2-0", "m1-0"]),
    );

    expect(state).toEqual({ error: null });
    expect(reorderMatchesInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { matchIds: ["m2-0", "m1-0"] },
    );
    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
  });

  it("保存の前に所属を確かめる", async () => {
    await reorderMatchesAction({ error: null }, formData(["m1-0"]));

    expect(calls).toEqual(["requireOrganization", "reorderMatchesInDb"]);
  });

  it("並びが空なら保存せずエラーを返す", async () => {
    const state = await reorderMatchesAction({ error: null }, formData([]));

    expect(state.error).toBe("並び順が不正です");
    expect(reorderMatchesInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ notFound", async () => {
    reorderMatchesInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      reorderMatchesAction({ error: null }, formData(["m1-0"])),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(revalidateDivisionSetup).not.toHaveBeenCalled();
  });
});
