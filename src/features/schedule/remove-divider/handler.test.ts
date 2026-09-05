import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const removeDividerInDb = vi.fn();
const revalidateSchedule = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateSchedule: (slug: string, tournamentId: string) =>
    revalidateSchedule(slug, tournamentId),
}));
vi.mock("./repository", () => ({
  removeDividerInDb: (ids: unknown, input: unknown) => {
    calls.push("removeDividerInDb");
    return removeDividerInDb(ids, input);
  },
}));

const { removeDividerAction } = await import("./handler");

const formData = (itemId: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("itemId", itemId);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  removeDividerInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  removeDividerInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("removeDividerAction", () => {
  it("認可を独立に確かめ、id をポートへ渡す", async () => {
    await removeDividerAction(INITIAL_SCHEDULE_FORM_STATE, formData("s1"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(removeDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { itemId: "s1" },
    );
    expect(calls).toEqual(["requireOrganization", "removeDividerInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await removeDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("s1"),
    );

    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("id が空なら入力エラーにする", async () => {
    const state = await removeDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(""),
    );

    expect(state.error).toBe("区切りの指定が不正です");
    expect(removeDividerInDb).not.toHaveBeenCalled();
  });

  it("対象の区切りが無ければ文言を返す", async () => {
    const { ScheduleItemNotFoundError } = await import("../errors");
    removeDividerInDb.mockReturnValue(
      Effect.fail(new ScheduleItemNotFoundError({ itemId: "s1" })),
    );

    const state = await removeDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("s1"),
    );

    expect(state.error).toBe(
      "対象の区切りが見つかりません。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    removeDividerInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      removeDividerAction(INITIAL_SCHEDULE_FORM_STATE, formData("s1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
