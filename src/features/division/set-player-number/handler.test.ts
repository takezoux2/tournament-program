import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const setPlayerNumberInDb = vi.fn();
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
  setPlayerNumberInDb: (ids: unknown, input: unknown) => {
    calls.push("setPlayerNumberInDb");
    return setPlayerNumberInDb(ids, input);
  },
}));

const { setPlayerNumberAction } = await import("./handler");

const formData = (
  participantId: string,
  playerNumber: string,
  confirmedNumber?: string,
) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("participantId", participantId);
  data.set("playerNumber", playerNumber);
  if (confirmedNumber !== undefined) {
    data.set("confirmedNumber", confirmedNumber);
  }
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  setPlayerNumberInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  setPlayerNumberInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { updated: true } }),
  );
});

describe("setPlayerNumberAction", () => {
  it("認可を独立に確かめ、トリム済みの入力をポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("p1", " 7 "),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { participantId: "p1", playerNumber: "7", confirmed: false },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "setPlayerNumberInDb"]);
  });

  it("重複が無ければ再検証してエラー無しで返す", async () => {
    const state = await setPlayerNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("p1", "7"),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
  });

  it("重複していたら確認待ちを返し、再検証しない", async () => {
    setPlayerNumberInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { updated: false } }),
    );

    const state = await setPlayerNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("p1", "7"),
    );

    expect(state).toEqual({
      error: null,
      confirm: {
        message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
        value: "7",
      },
    });
    expect(revalidateDivisionSetup).not.toHaveBeenCalled();
  });

  it("confirm で返した値と同じ番号の再送は確認済みとしてポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("p1", " 7 ", "7"),
    );

    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { participantId: "p1", playerNumber: "7", confirmed: true },
    );
  });

  it("確認後に番号を変えて送ったら未確認としてポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("p1", "8", "7"),
    );

    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { participantId: "p1", playerNumber: "8", confirmed: false },
    );
  });

  it("選手番号が空なら入力エラーにする", async () => {
    const state = await setPlayerNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("p1", "  "),
    );

    expect(state.error).toBe("選手番号を入力してください");
    expect(setPlayerNumberInDb).not.toHaveBeenCalled();
  });

  it("参加者が見つからなければ文言を返す", async () => {
    const { DivisionParticipantNotFoundError } = await import("../errors");
    setPlayerNumberInDb.mockReturnValue(
      Effect.fail(
        new DivisionParticipantNotFoundError({ participantId: "p1" }),
      ),
    );

    const state = await setPlayerNumberAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("p1", "7"),
    );

    expect(state.error).toBe(
      "対象の参加者が見つかりません。画面を再読み込みしてください",
    );
  });

  it("部門が無ければ 404 にする", async () => {
    setPlayerNumberInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      setPlayerNumberAction(INITIAL_DIVISION_FORM_STATE, formData("p1", "7")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
