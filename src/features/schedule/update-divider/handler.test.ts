import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const updateDividerInDb = vi.fn();
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
  updateDividerInDb: (ids: unknown, input: unknown) => {
    calls.push("updateDividerInDb");
    return updateDividerInDb(ids, input);
  },
}));

const { updateDividerAction } = await import("./handler");

const formData = (label: string, startsAt: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("itemId", "s1");
  data.set("label", label);
  data.set("startsAt", startsAt);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  updateDividerInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  updateDividerInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("updateDividerAction", () => {
  it("認可を独立に確かめ、トリム済みの入力をポートへ渡す", async () => {
    await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(" 午前の部 ", "2026-09-05T09:00"),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(updateDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      {
        itemId: "s1",
        label: "午前の部",
        startsAt: new Date("2026-09-05T09:00"),
      },
    );
    expect(calls).toEqual(["requireOrganization", "updateDividerInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("午前の部", ""),
    );

    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("見出しが空なら入力エラーにする", async () => {
    const state = await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("  ", ""),
    );

    expect(state.error).toBe("見出しを入力してください");
    expect(updateDividerInDb).not.toHaveBeenCalled();
  });

  it("対象の区切りが無ければ文言を返す", async () => {
    const { ScheduleItemNotFoundError } = await import("../errors");
    updateDividerInDb.mockReturnValue(
      Effect.fail(new ScheduleItemNotFoundError({ itemId: "s1" })),
    );

    const state = await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("午前の部", ""),
    );

    expect(state.error).toBe(
      "対象の区切りが見つかりません。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    updateDividerInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      updateDividerAction(
        INITIAL_SCHEDULE_FORM_STATE,
        formData("午前の部", ""),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
