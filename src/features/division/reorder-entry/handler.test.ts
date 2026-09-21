import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const reorderEntryInDb = vi.fn();
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
  reorderEntryInDb: (ids: unknown, input: unknown) => {
    calls.push("reorderEntryInDb");
    return reorderEntryInDb(ids, input);
  },
}));

const { reorderEntryAction } = await import("./handler");

const formData = (entryId: string, direction: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("entryId", entryId);
  data.set("direction", direction);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  reorderEntryInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  reorderEntryInDb.mockReturnValue(
    Effect.succeed({
      found: true,
      value: { moved: true, matching: "unchanged" },
    }),
  );
});

describe("reorderEntryAction", () => {
  it("認可を独立に確かめ、DB 処理より前に実行し、入力をポートへ渡す", async () => {
    await reorderEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e2", "up"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(reorderEntryInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { entryId: "e2", direction: "up" },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "reorderEntryInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e2", "up"),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
  });

  it("端まで来ていてもエラーにしない", async () => {
    reorderEntryInDb.mockReturnValue(
      Effect.succeed({
        found: true,
        value: { moved: false },
      }),
    );

    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1", "up"),
    );

    expect(state.error).toBeNull();
  });

  it("作り直したときだけ通知を出す", async () => {
    reorderEntryInDb.mockReturnValue(
      Effect.succeed({
        found: true,
        value: { moved: true, matching: "regenerated" },
      }),
    );

    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e2", "up"),
    );

    expect(state).toEqual({
      error: null,
      notice: "並べ替えに合わせて対戦表を作り直しました",
    });
  });

  it("リーグの上限超過で取り消されたときはその旨を伝える", async () => {
    // EntryRowActions.tsx が reorderState.notice を表示するようになった
    // ので、handler が返す文言が事実と違うと画面がそのまま嘘をつく。
    reorderEntryInDb.mockReturnValue(
      Effect.succeed({
        found: true,
        value: { moved: true, matching: "clearedOverCap" },
      }),
    );

    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e2", "up"),
    );

    expect(state).toEqual({
      error: null,
      notice:
        "並べ替えは反映しましたが、リーグの上限を超えたままのため組み合わせは取り消したままです",
    });
  });

  it("向きが不正ならポートを呼ばない", async () => {
    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1", "sideways"),
    );

    expect(state.error).toBe("並べ替えの向きが不正です");
    expect(reorderEntryInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ 404 にする", async () => {
    reorderEntryInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      reorderEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1", "up")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
