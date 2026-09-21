import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionMatchNotFoundError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const clearSlotInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (...args: unknown[]) =>
    revalidateDivisionSetup(...args),
}));
vi.mock("./repository", () => ({
  clearSlotInDb: (ids: unknown, input: unknown) => clearSlotInDb(ids, input),
}));

const { clearSlotAction } = await import("./handler");

const formData = () => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  clearSlotInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  clearSlotInDb.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("clearSlotAction", () => {
  it("スロットをポートへ渡し、succeeded を増やす", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    const state = await clearSlotAction({ error: null, succeeded: 4 }, data);
    expect(clearSlotInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { matchId: "m1-0", slotIndex: 0 },
    );
    expect(state).toEqual({ error: null, succeeded: 5 });
  });

  it("slotIndex が不正なら入力エラーでポートを呼ばない", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "5");
    const state = await clearSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(state).toEqual({ error: "スロットの指定が不正です" });
    expect(clearSlotInDb).not.toHaveBeenCalled();
  });

  it("組織の id でポートを呼び、再検証する", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    await clearSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
  });

  it("ドメインエラーは文言にする", async () => {
    clearSlotInDb.mockReturnValue(
      Effect.fail(new DivisionMatchNotFoundError({ matchId: "m1-0" })),
    );
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    const state = await clearSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(state.error).toBe(
      "対象の試合が見つかりません。画面を再読み込みしてください",
    );
    expect(state.succeeded).toBeUndefined();
  });

  it("見つからなければ 404", async () => {
    clearSlotInDb.mockReturnValue(Effect.succeed({ found: false }));
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    await expect(
      clearSlotAction(INITIAL_DIVISION_FORM_STATE, data),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
