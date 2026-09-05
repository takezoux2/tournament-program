import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const reorderScheduleInDb = vi.fn();
const revalidateSchedule = vi.fn();
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
  revalidateSchedule: (slug: string, tournamentId: string) =>
    revalidateSchedule(slug, tournamentId),
}));
vi.mock("./repository", () => ({
  reorderScheduleInDb: (ids: unknown, input: unknown) => {
    calls.push("reorderScheduleInDb");
    return reorderScheduleInDb(ids, input);
  },
}));

const { reorderScheduleAction } = await import("./handler");

const formData = (keys: string[]) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  for (const key of keys) {
    data.append("key", key);
  }
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  reorderScheduleInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  reorderScheduleInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("reorderScheduleAction", () => {
  it("認可を独立に確かめ、キー配列をポートへ渡す", async () => {
    await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(["divider:s1", "match:dA:m1-0"]),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(reorderScheduleInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { keys: ["divider:s1", "match:dA:m1-0"] },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "reorderScheduleInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(["match:dA:m1-0"]),
    );

    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("キーが 1 件も無ければ入力エラーにする", async () => {
    const state = await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData([]),
    );

    expect(state.error).toBe("並び順が不正です");
    expect(reorderScheduleInDb).not.toHaveBeenCalled();
  });

  it("並びがずれていたら再読み込みを促す", async () => {
    const { ScheduleStaleError } = await import("../errors");
    reorderScheduleInDb.mockReturnValue(
      Effect.fail(new ScheduleStaleError({ tournamentId: "t1" })),
    );

    const state = await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(["match:dA:m1-0"]),
    );

    expect(state.error).toBe(
      "一覧が更新されています。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    reorderScheduleInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      reorderScheduleAction(
        INITIAL_SCHEDULE_FORM_STATE,
        formData(["match:dA:m1-0"]),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
