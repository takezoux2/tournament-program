import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const swapSlotsInDb = vi.fn();
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
  swapSlotsInDb: (ids: unknown, input: unknown) => {
    calls.push("swapSlotsInDb");
    return swapSlotsInDb(ids, input);
  },
}));

const { swapSlotsAction } = await import("./handler");

const formData = (indexA: string, indexB: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("indexA", indexA);
  data.set("indexB", indexB);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  swapSlotsInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  swapSlotsInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { swapped: true } }),
  );
});

describe("swapSlotsAction", () => {
  it("認可を独立に確かめ、数値に直した添字をポートへ渡す", async () => {
    await swapSlotsAction(INITIAL_DIVISION_FORM_STATE, formData("0", "3"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(swapSlotsInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { indexA: 0, indexB: 3 },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "swapSlotsInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await swapSlotsAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("0", "3"),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
  });

  it("入れ替えが起きなくてもエラーにしない", async () => {
    swapSlotsInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { swapped: false } }),
    );

    const state = await swapSlotsAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("2", "2"),
    );

    expect(state.error).toBeNull();
  });

  it("添字が不正なら入力エラーにする", async () => {
    const state = await swapSlotsAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("-1", "0"),
    );

    expect(state.error).toBe("スロットの指定が不正です");
    expect(swapSlotsInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ 404 にする", async () => {
    swapSlotsInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      swapSlotsAction(INITIAL_DIVISION_FORM_STATE, formData("0", "1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
