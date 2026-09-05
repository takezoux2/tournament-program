import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const insertDividerInDb = vi.fn();
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
  insertDividerInDb: (ids: unknown, input: unknown) => {
    calls.push("insertDividerInDb");
    return insertDividerInDb(ids, input);
  },
}));

const { insertDividerAction } = await import("./handler");

const formData = (anchorKey: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("anchorKey", anchorKey);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  insertDividerInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  insertDividerInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("insertDividerAction", () => {
  it("認可を独立に確かめ、アンカーをポートへ渡す", async () => {
    await insertDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("match:dA:m1-0"),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(insertDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { anchorKey: "match:dA:m1-0" },
    );
    expect(calls).toEqual(["requireOrganization", "insertDividerInDb"]);
  });

  it("アンカーが空文字でも受け付ける（先頭への挿入）", async () => {
    const state = await insertDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(""),
    );

    expect(insertDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { anchorKey: "" },
    );
    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("並びがずれていたら再読み込みを促す", async () => {
    const { ScheduleStaleError } = await import("../errors");
    insertDividerInDb.mockReturnValue(
      Effect.fail(new ScheduleStaleError({ tournamentId: "t1" })),
    );

    const state = await insertDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("match:dA:m1-0"),
    );

    expect(state.error).toBe(
      "一覧が更新されています。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    insertDividerInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      insertDividerAction(INITIAL_SCHEDULE_FORM_STATE, formData("")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
