import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const removeEntryInDb = vi.fn();
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
  removeEntryInDb: (ids: unknown, input: unknown) => {
    calls.push("removeEntryInDb");
    return removeEntryInDb(ids, input);
  },
}));

const { removeEntryAction } = await import("./handler");

const formData = (entryId: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("entryId", entryId);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  removeEntryInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  removeEntryInDb.mockReturnValue(
    Effect.succeed({
      found: true,
      value: { removed: true, matching: "unchanged" },
    }),
  );
});

describe("removeEntryAction", () => {
  it("認可を独立に確かめ、entryId をポートへ渡す", async () => {
    await removeEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(removeEntryInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { entryId: "e1" },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "removeEntryInDb"]);
  });

  it("再生成が起きたら通知を返す", async () => {
    removeEntryInDb.mockReturnValue(
      Effect.succeed({
        found: true,
        value: { removed: true, matching: "regenerated" },
      }),
    );

    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1"),
    );

    expect(state.error).toBeNull();
    expect(state.notice).toBe("エントリーを削除し、組み合わせを再生成しました");
  });

  it("再生成が起きなければ削除だけを伝える", async () => {
    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1"),
    );

    expect(state.notice).toBe("エントリーを削除しました");
  });

  it("組み合わせが消えたときは再生成したとは言わない", async () => {
    // 残りが 2 人未満だと木は作れず空になる。ここで「再生成しました」と
    // 出すと、消えた組み合わせが残っているかのように読める。
    removeEntryInDb.mockReturnValue(
      Effect.succeed({
        found: true,
        value: { removed: true, matching: "cleared" },
      }),
    );

    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1"),
    );

    expect(state.notice).toBe(
      "エントリーを削除し、残りが 2 人未満になったため組み合わせを取り消しました",
    );
  });

  it("何も消えていなければ通知を出さない", async () => {
    // 対象が無かった場合。存在を漏らさないためエラーにはしないが、
    // 「削除しました」と出すと消えていない行が消えたように見える。
    removeEntryInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { removed: false } }),
    );

    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1"),
    );

    expect(state.error).toBeNull();
    expect(state.notice).toBeUndefined();
  });

  it("成功したら再検証する", async () => {
    await removeEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1"));

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
  });

  it("entryId が空ならポートを呼ばない", async () => {
    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(""),
    );

    expect(state.error).toBe("エントリーの指定が不正です");
    expect(removeEntryInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ 404 にする", async () => {
    removeEntryInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      removeEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
