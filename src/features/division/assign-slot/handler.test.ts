import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionDuplicateEntryError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const assignSlotInDb = vi.fn();
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
  assignSlotInDb: (ids: unknown, input: unknown) => assignSlotInDb(ids, input),
}));

const { assignSlotAction } = await import("./handler");

const formData = () => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  assignSlotInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  assignSlotInDb.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("assignSlotAction", () => {
  it("スロットと既存メンバーの選択をポートへ渡し、succeeded を増やす", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "1");
    data.set("mode", "existing");
    data.set("memberId", "m-2");
    const state = await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(assignSlotInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      {
        matchId: "m1-0",
        slotIndex: 1,
        occupant: { mode: "existing", memberId: "m-2" },
      },
    );
    expect(state).toEqual({ error: null, succeeded: 1 });
  });

  it("新規登録で氏名が空なら入力エラー", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    data.set("mode", "new");
    data.set("name", " ");
    data.set("nameKana", "かな");
    const state = await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(state).toEqual({ error: "氏名を入力してください" });
    expect(assignSlotInDb).not.toHaveBeenCalled();
  });

  it("slotIndex が不正なら入力エラー", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "5");
    data.set("mode", "existing");
    data.set("memberId", "m-2");
    const state = await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(state).toEqual({ error: "スロットの指定が不正です" });
    expect(assignSlotInDb).not.toHaveBeenCalled();
  });

  it("組織の id でポートを呼び、再検証する", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    data.set("mode", "existing");
    data.set("memberId", "m-2");
    await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
  });

  it("succeeded は前の状態から積み増す", async () => {
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    data.set("mode", "existing");
    data.set("memberId", "m-2");
    const state = await assignSlotAction({ error: null, succeeded: 4 }, data);
    expect(state).toEqual({ error: null, succeeded: 5 });
  });

  it("ドメインエラーは文言にする", async () => {
    assignSlotInDb.mockReturnValue(
      Effect.fail(new DivisionDuplicateEntryError({ divisionId: "d1" })),
    );
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    data.set("mode", "existing");
    data.set("memberId", "m-2");
    const state = await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(state).toEqual({
      error: "すでに同じエントリーが登録されています",
    });
  });

  it("リーグ順位の指定をポートへ渡す", async () => {
    const data = formData();
    data.set("matchId", "m1");
    data.set("slotIndex", "0");
    data.set("mode", "leagueRank");
    data.set("sourceDivisionId", "d2");
    data.set("rank", "2");
    await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
    expect(assignSlotInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      {
        matchId: "m1",
        slotIndex: 0,
        occupant: { mode: "leagueRank", sourceDivisionId: "d2", rank: 2 },
      },
    );
  });

  it("見つからなければ 404", async () => {
    assignSlotInDb.mockReturnValue(Effect.succeed({ found: false }));
    const data = formData();
    data.set("matchId", "m1-0");
    data.set("slotIndex", "0");
    data.set("mode", "existing");
    data.set("memberId", "m-2");
    await expect(
      assignSlotAction(INITIAL_DIVISION_FORM_STATE, data),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
