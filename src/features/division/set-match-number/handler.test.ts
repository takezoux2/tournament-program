import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const setMatchNumberInDb = vi.fn();
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
  setMatchNumberInDb: (ids: unknown, input: unknown) => {
    calls.push("setMatchNumberInDb");
    return setMatchNumberInDb(ids, input);
  },
}));

const { setMatchNumberAction } = await import("./handler");

const formData = (matchId: string, matchNumber: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("matchId", matchId);
  data.set("matchNumber", matchNumber);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  setMatchNumberInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  setMatchNumberInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("setMatchNumberAction", () => {
  it("認可を独立に確かめ、トリム済みの入力をポートへ渡す", async () => {
    await setMatchNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("m1", " 12 "),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(setMatchNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { matchId: "m1", matchNumber: "12" },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "setMatchNumberInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await setMatchNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("m1", "12"),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
  });

  it("試合番号が空なら入力エラーにする", async () => {
    const state = await setMatchNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("m1", "  "),
    );

    expect(state.error).toBe("試合番号を入力してください");
    expect(setMatchNumberInDb).not.toHaveBeenCalled();
  });

  it("試合番号が重複していたら文言を返す", async () => {
    const { DivisionMatchNumberConflictError } = await import("../errors");
    setMatchNumberInDb.mockReturnValue(
      Effect.fail(new DivisionMatchNumberConflictError({ matchNumber: "12" })),
    );

    const state = await setMatchNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("m1", "12"),
    );

    expect(state.error).toBe("その試合番号は別の試合で使われています");
  });

  it("部門が無ければ 404 にする", async () => {
    setMatchNumberInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      setMatchNumberAction(INITIAL_DIVISION_FORM_STATE, formData("m1", "12")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
